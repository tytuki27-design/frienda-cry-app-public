"""Local, experimental YAMNet embedding comparison; never uploads recordings.

Requires official YAMNet sources + pretrained yamnet.h5 and TensorFlow/Keras 2.
Missing weights fail before inference; randomly initialized models are not used.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

MODEL_COMMIT = '34a21326906b9574fa11c4d6d0a5c534ff039267'
MODEL_WEIGHTS_URL = 'https://storage.googleapis.com/audioset/yamnet.h5'
# Verified against the official HTTPS artifact and publisher's size/MD5 metadata.
WEIGHTS_SHA256 = '13c3308955bbfaef262f175ac9c40e47b134573a93984f009220dd7cc12a1744'
SOURCE_HASHES = {
    'yamnet.py': '7ef3df32b7ecb782490b5a04d7581a23cfcf701dbf476bc4d03deefe22cdb040',
    'params.py': '925bb1e62461016031f98aea09aeac28975dd516f5747513767de5d1b06b6145',
    'features.py': 'e6cd53f81d072c7c43be4c7fff2b9dd0c5ccc7d64f2fbcfc85b44013d6d2ed5e',
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--yamnet-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--normalize-peak', action='store_true', help='Scale each reference and query to peak 0.95, without label-dependent choices')
    args = parser.parse_args()
    model_dir = args.yamnet_dir.resolve()
    weights = model_dir / 'yamnet.h5'
    if not weights.is_file() or weights.stat().st_size == 0:
        raise ValueError(f'Pretrained weights missing: {weights}. Obtain the official artifact: {MODEL_WEIGHTS_URL}')
    for file in ['yamnet.py', 'params.py', 'features.py']:
        if not (model_dir / file).is_file():
            raise ValueError(f'Official YAMNet source missing: {file}')
        if sha256((model_dir / file).read_bytes()) != SOURCE_HASHES[file]:
            raise ValueError(f'YAMNet source differs from pinned official commit: {file}')
    if sha256(weights.read_bytes()) != WEIGHTS_SHA256:
        raise ValueError('Pretrained weights differ from verified official YAMNet artifact')
    manifest = json.loads(args.manifest.read_text())
    # All current recordings were used to investigate methods: require the honest label.
    if manifest.get('purpose') != 'development' or not manifest.get('recordings'):
        raise ValueError('This prototype requires a nonempty development manifest')
    script = (Path(__file__).resolve().parent.parent / 'index.html').read_text()
    embedded = json.loads(script.split('const EMBEDDED=')[1].split(';\nconst names=')[0])
    cases = []
    ids = set()
    for item in manifest['recordings']:
        if item.get('split') != 'test' or item.get('name') not in embedded or not item.get('id') or item['id'] in ids:
            raise ValueError('Require unique id, known Pokemon label and split=test')
        if 'start' in item or 'end' in item:
            raise ValueError('This prototype compares whole recordings; explicit intervals are not supported')
        ids.add(item['id'])
        audio = (args.manifest.parent / item['file']).read_bytes()
        cases.append((item, audio))
    os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
    os.environ.setdefault('TF_NUM_INTRAOP_THREADS', '2')
    os.environ.setdefault('TF_NUM_INTEROP_THREADS', '1')
    os.environ.setdefault('MPLCONFIGDIR', '/tmp/frienda-matplotlib')
    import numpy as np
    import tensorflow as tf
    sys.path.insert(0, str(model_dir))
    import params
    import yamnet
    settings = params.Params()
    model = yamnet.yamnet_frames_model(settings)
    model.load_weights(str(weights))  # Deliberately no fallback to random weights.

    def extract(audio):
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'], input=audio, check=True, capture_output=True).stdout
        waveform = np.frombuffer(pcm, dtype='<f4')
        if waveform.size == 0 or not np.isfinite(waveform).all():
            raise ValueError('Empty or nonfinite decoded audio')
        if args.normalize_peak:
            peak = np.max(np.abs(waveform))
            if peak <= 1e-12:
                raise ValueError('Silent audio cannot be peak-normalized')
            waveform = waveform * (0.95 / peak)
        _, embeddings, _ = model(tf.convert_to_tensor(waveform))
        embeddings = embeddings.numpy()
        if embeddings.ndim != 2 or embeddings.shape[1] != 1024 or not np.isfinite(embeddings).all():
            raise ValueError('Unexpected YAMNet embedding output')
        hop = round(settings.patch_hop_seconds * settings.sample_rate)
        window = round((settings.patch_window_seconds + settings.stft_window_seconds - settings.stft_hop_seconds) * settings.sample_rate)
        energy = np.array([float(np.mean(waveform[i * hop:min(len(waveform), i * hop + window)] ** 2)) if i * hop < len(waveform) else 0 for i in range(len(embeddings))])
        if energy.sum() <= 1e-20:
            raise ValueError('Silent audio cannot be assigned a Pokemon by this prototype')
        pooled = {'mean': embeddings.mean(axis=0), 'energy_weighted': np.average(embeddings, axis=0, weights=energy)}
        for key, vector in pooled.items():
            norm = np.linalg.norm(vector)
            if not np.isfinite(norm) or norm <= 1e-12:
                raise ValueError('Zero or nonfinite embedding norm')
            pooled[key] = vector / norm
        return pooled, len(waveform) / 16000, len(embeddings)

    references = {name: extract(base64.b64decode(audio))[0] for name, audio in embedded.items()}
    rows = []
    for item, audio in cases:
        start = time.perf_counter()
        vectors, duration, frames = extract(audio)
        rankings = {mode: sorted([{'name': name, 'score': float(np.dot(vector, references[name][mode]))} for name in references], key=lambda r: r['score'], reverse=True) for mode, vector in vectors.items()}
        rows.append({'id': item['id'], 'name': item['name'], 'audioSha256': sha256(audio), 'duration': duration, 'embeddingFrames': frames, 'processingMs': (time.perf_counter() - start) * 1000, 'rankings': {mode: ranking[:5] for mode, ranking in rankings.items()}})
    summary = {mode: {'correct': sum(row['rankings'][mode][0]['name'] == row['name'] for row in rows), 'total': len(rows)} for mode in ['mean', 'energy_weighted']}
    report = {'status': 'development experiment; not independent accuracy or iPhone performance', 'model': 'official YAMNet, 1024-D embeddings; 521-class event head unused', 'sourceCommit': MODEL_COMMIT, 'sourceHashes': {name: sha256((model_dir / name).read_bytes()) for name in ['yamnet.py', 'params.py', 'features.py']}, 'weightsUrl': MODEL_WEIGHTS_URL, 'weightsSha256': sha256(weights.read_bytes()), 'tensorflowVersion': tf.__version__, 'inputSampleRate': 16000, 'normalizePeak': args.normalize_peak, 'summary': summary, 'rows': rows}
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'YAMNet evaluation blocked: {error}', file=sys.stderr)
        sys.exit(1)
