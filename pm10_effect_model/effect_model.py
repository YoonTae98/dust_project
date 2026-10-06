"""Research prototype. No default removal efficiency and no production UI writes.
Endpoint: length-weighted near-road PM10 over a fixed evaluation road network.
Background adjustment is motivated by field studies; the proportional regression
and network extrapolation here are project assumptions, not validated literature formulas.
"""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path


def number(value, name, positive=False):
    try:
        value = float(value)
    except (ValueError, TypeError):
        raise ValueError(f'{name}: numeric value required') from None
    if not math.isfinite(value) or value < 0 or (positive and value == 0):
        raise ValueError(f'{name}: finite {"positive" if positive else "nonnegative"} value required')
    return value


def prepare(rows):
    if not rows:
        raise ValueError('No paired cleaning/control observations. Ambient station history alone is insufficient.')
    seen, out = set(), []
    for row in rows:
        for key in ('observation_id', 'event_id', 'source', 'protocol_id'):
            if not str(row.get(key, '')).strip():
                raise ValueError(f'{key} is required for provenance and grouped validation')
        if row['observation_id'] in seen:
            raise ValueError('Duplicate observation_id')
        seen.add(row['observation_id'])
        r = dict(row)
        for key in ('treated_before', 'treated_after', 'control_before', 'control_after'):
            r[key] = number(row.get(key), key, positive=key == 'treated_before')
        # Observed reduction minus contemporaneous change at untreated controls.
        r['adjusted_reduction'] = ((r['treated_before'] - r['treated_after'])
                                   - (r['control_before'] - r['control_after']))
        out.append(r)
    if len({r['protocol_id'] for r in out}) != 1:
        raise ValueError('Do not pool different equipment, endpoints, post-cleaning horizons or protocols')
    return out


def coefficient(rows):
    # Through-origin least squares: adjusted reduction = beta * before PM10.
    # No coefficient is supplied as a scientific default; beta is fit to input data.
    return math.fsum(r['treated_before'] * r['adjusted_reduction'] for r in rows) / math.fsum(r['treated_before'] ** 2 for r in rows)


def fit(rows):
    data = prepare(rows)
    events = sorted({r['event_id'] for r in data})
    if len(events) < 2:
        raise ValueError('At least two independent events are required for leave-one-event-out validation; two does not establish adequacy')
    beta = coefficient(data)
    errors, null_errors, fold_coefficients = [], [], []
    for event in events:
        training = [r for r in data if r['event_id'] != event]
        heldout = [r for r in data if r['event_id'] == event]
        b = coefficient(training)
        fold_coefficients.append(b)
        for r in heldout:
            errors.append(r['adjusted_reduction'] - b * r['treated_before'])
            null_errors.append(r['adjusted_reduction'])
    mae = math.fsum(abs(e) for e in errors) / len(errors)
    null_mae = math.fsum(abs(e) for e in null_errors) / len(null_errors)
    return {'schema': 'paired-roadside-pm10-v1', 'status': 'research_only_unvalidated_transfer',
            'endpoint': 'near_road_pm10_ug_m3', 'protocol_id': data[0]['protocol_id'],
            'beta': beta, 'coefficient_origin': 'estimated_from_supplied_paired_observations',
            'n_observations': len(data), 'n_events': len(events),
            'before_range': [min(r['treated_before'] for r in data), max(r['treated_before'] for r in data)],
            'sources': sorted({r['source'] for r in data}),
            'training_sha256': hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest(),
            'validation': {'scheme': 'leave_one_event_out', 'mae_ug_m3': mae,
                'rmse_ug_m3': math.sqrt(math.fsum(e*e for e in errors) / len(errors)),
                'no_cleaning_effect_mae_ug_m3': null_mae, 'beats_no_effect_baseline': mae < null_mae,
                'fold_coefficients': fold_coefficients}}


def official_reference_model():
    """Reported mean effect used as a transfer scenario, not a local fitted model."""
    return {'schema': 'paired-roadside-pm10-v1',
            'status': 'official_reference_transfer_scenario',
            'endpoint': 'road_resuspended_pm10_ug_m3',
            'protocol_id': 'dust_suction_reference_30_to_60_min',
            'beta': 0.433, 'before_range': [0, None],
            'coefficient_origin': 'MOE_Keco_reported_vehicle_type_mean_2023_04_26',
            'sources': ['https://www.airkorea.or.kr/portal/web/board/7/7173/?page=13'],
            'measurement_window': {'before': '10–30 min before cleaning', 'after': '30–60 min after cleaning'},
            'validation': {'status': 'not_validated_for_Daegu_routes',
                           'reported_mean_is_not_per_road_guarantee': True,
                           'concentration_applicability_range': 'not_reported'}}


def compare(model, case):
    if model.get('schema') != 'paired-roadside-pm10-v1':
        raise ValueError('Unsupported model')
    beta = float(model['beta'])
    if not math.isfinite(beta) or beta > 1:
        raise ValueError('Model implies negative post-cleaning concentration; inspect observations/model, do not clip')
    if case.get('protocol_id') != model['protocol_id']:
        raise ValueError('Evaluation protocol must match fitted protocol')
    if case.get('endpoint') != model['endpoint']:
        raise ValueError('Endpoint mismatch: do not treat district IDW ambient PM10 as measured near-road PM10')
    if not str(case.get('observation_context', '')).strip():
        raise ValueError('observation_context required')
    if set(case.get('routes', {})) != {'A', 'B', 'C', 'AI'}:
        raise ValueError('Exactly A, B, C and AI routes are required')
    segments = {}
    for r in case.get('segments', []):
        key = r.get('segment_id')
        if not key or key in segments or not str(r.get('source', '')).strip():
            raise ValueError('Unique segment_id and data source required')
        length = number(r.get('length_km'), 'length_km', positive=True)
        pm = number(r.get('pm10_before'), 'pm10_before')
        if pm < model['before_range'][0] or (model['before_range'][1] is not None and pm > model['before_range'][1]):
            raise ValueError('Concentration outside fitted range; extrapolation is not enabled')
        segments[key] = (length, pm)
    if not segments:
        raise ValueError('Fixed evaluation road network required')
    total_length = math.fsum(v[0] for v in segments.values())
    before = math.fsum(length * pm for length, pm in segments.values()) / total_length
    if before <= 0:
        raise ValueError('Zero baseline: percentage undefined')
    results = {}
    for label, route in case['routes'].items():
        cleaned = set(route['cleaned_segment_ids'])
        if not cleaned <= segments.keys():
            raise ValueError('Route contains unknown evaluation segments')
        # Explicit project assumption: one pass per verified cleaned segment;
        # no assumed spillover, temporal decay, repeat-pass gain or background trend.
        after = math.fsum(length * pm * (1-beta if sid in cleaned else 1)
                           for sid, (length, pm) in segments.items()) / total_length
        reduction = (before-after)/before*100
        results[label] = {'before_pm10': before, 'after_pm10_scenario': after,
                          'reduction_pct': reduction, 'display_change_pct': -reduction,
                          'route_length_km': number(route['route_length_km'], 'route_length_km', positive=True)}
    baseline = math.fsum(results[k]['reduction_pct'] for k in ('A', 'B', 'C'))/3
    ai = results['AI']['reduction_pct']
    return {'status': 'conditional_scenario_not_validated_prediction',
            'endpoint': 'length_weighted_' + model['endpoint'] + '_on_fixed_network',
            'coefficient': beta, 'coefficient_origin': model['coefficient_origin'],
            'sources': model['sources'],
            'observation_context': case['observation_context'], 'routes': results,
            'abc_mean_distance_km': math.fsum(results[k]['route_length_km'] for k in ('A', 'B', 'C'))/3,
            'abc_mean_reduction_pct': baseline,
            'ai_improvement_pct': (ai/baseline-1)*100 if baseline > 0 else None,
            'ai_difference_percentage_points': ai-baseline,
            'assumptions': ['matched protocol and exchangeable road segments', 'one cleaning pass',
                            'fixed common road network', 'no spillover or time decay',
                            'background held constant for comparison'],
            'validation': model['validation']}


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    ref = sub.add_parser('reference'); ref.add_argument('output_json')
    f = sub.add_parser('fit'); f.add_argument('observations_csv'); f.add_argument('output_json')
    p = sub.add_parser('compare'); p.add_argument('model_json'); p.add_argument('case_json'); p.add_argument('output_json')
    args = parser.parse_args()
    if args.command == 'reference':
        result = official_reference_model()
    elif args.command == 'fit':
        with open(args.observations_csv, encoding='utf-8-sig', newline='') as file:
            result = fit(list(csv.DictReader(file)))
    else:
        result = compare(json.loads(Path(args.model_json).read_text()), json.loads(Path(args.case_json).read_text()))
    Path(args.output_json).write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    print(args.output_json)

if __name__ == '__main__':
    main()
