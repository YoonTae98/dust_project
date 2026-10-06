with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

assert 'id="patrol-nav-hud"' in html, "patrol-nav-hud missing"
assert 'dynamic-route-modal' in html, "dynamic-route-modal missing"

with open('static/css/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

assert '.patrol-nav-hud' in css, "patrol-nav-hud css missing"
assert '.fleet-nav-direct-btn' in css, "fleet-nav-direct-btn css missing"
assert '.table-filter-chip' in css, "table-filter-chip css missing"

with open('static/js/map.js', 'r', encoding='utf-8') as f:
    js = f.read()

assert 'fleet-nav-direct-btn' in js
assert 'startPatrolNavigation' in js

assert 'startPatrolNavigation(vehicleId' in js
assert 'function stopPatrolNavigation()' in js
assert 'function toggleNavSimulationMode()' in js
assert 'navigator.geolocation.watchPosition' in js
assert 'body.nav-active .floating-header' in css, "body.nav-active hiding floating-header missing"
assert 'body.nav-active #map' in css, "body.nav-active #map transform style missing"
assert 'updateMapHeadingRotation' in js, "updateMapHeadingRotation missing in js"
assert "document.body.classList.add('nav-active')" in js, "classList.add nav-active missing"
assert "document.body.classList.remove('nav-active')" in js, "classList.remove nav-active missing"

print('All Navigation Components Verified Successfully!')
