import os
import json
import joblib
import numpy as np

models_dir = os.path.abspath(r'ml_models/trained_models')
print('=' * 60)
print(f'VERIFYING TRAINED MODEL FILES IN: {models_dir}')
print('=' * 60)

files = [f for f in os.listdir(models_dir) if not f.endswith('.gitkeep')]
results = []

for fname in sorted(files):
    fpath = os.path.join(models_dir, fname)
    size_kb = os.path.getsize(fpath) / 1024.0
    print(f"\nChecking {fname} ({size_kb:.2f} KB)...")

    if fname.endswith('.json'):
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            print("  [SUCCESS] Valid JSON")
            print(f"  - Model Type: {data.get('model_type', 'N/A')}")
            features = data.get('features') or data.get('features_encoded', [])
            print(f"  - Feature Count: {len(features)}")
            print(f"  - Target: {data.get('target', 'N/A')}")
            results.append((fname, 'PASS', f"JSON loaded successfully ({len(features)} features)"))
        except Exception as e:
            print(f"  [FAIL] JSON error: {e}")
            results.append((fname, 'FAIL', str(e)))

    elif fname.endswith('.joblib'):
        try:
            obj = joblib.load(fpath)
            print("  [SUCCESS] Joblib object loaded successfully")
            print(f"  - Type: {type(obj)}")

            detail = f"Type: {type(obj).__name__}"
            if hasattr(obj, 'n_features_in_'):
                print(f"  - n_features_in_: {obj.n_features_in_}")
                detail += f", n_features_in_: {obj.n_features_in_}"
            if hasattr(obj, 'feature_names_in_'):
                print(f"  - feature_names_in_: {list(obj.feature_names_in_)}")
            if hasattr(obj, 'classes_'):
                print(f"  - classes_: {obj.classes_}")
            if hasattr(obj, 'mean_'):
                print(f"  - Scaler mean_ shape: {obj.mean_.shape}")
                detail += f", mean_ shape: {obj.mean_.shape}"

            # Perform a test prediction or transform if applicable
            if hasattr(obj, 'predict') and hasattr(obj, 'n_features_in_'):
                dummy_input = np.zeros((1, obj.n_features_in_))
                pred = obj.predict(dummy_input)
                print(f"  - Sanity check predict(zeros): {pred}")
                if hasattr(obj, 'predict_proba'):
                    proba = obj.predict_proba(dummy_input)
                    print(f"  - Sanity check predict_proba(zeros): probabilities {proba[0]}")
            elif hasattr(obj, 'transform') and hasattr(obj, 'mean_'):
                dummy_input = np.zeros((1, len(obj.mean_)))
                scaled = obj.transform(dummy_input)
                print(f"  - Sanity check transform(zeros): output shape {scaled.shape}")

            results.append((fname, 'PASS', detail))
        except Exception as e:
            print(f"  [FAIL] Joblib load error: {e}")
            results.append((fname, 'FAIL', str(e)))

print('\n' + '=' * 60)
print('SUMMARY RESULTS:')
print('=' * 60)
all_pass = True
for fname, status, info in results:
    icon = 'OK' if status == 'PASS' else 'ERROR'
    print(f"[{icon}] {fname:<25}: {info}")
    if status != 'PASS':
        all_pass = False

print('\nOverall Status:', 'ALL FILES READABLE & VALID' if all_pass else 'SOME FILES FAILED')
