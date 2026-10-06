with open('static/js/map.js', 'r', encoding='utf-8') as f:
    js = f.read()

assert 'A: false' in js, 'A default must be false'
assert 'B: false' in js, 'B default must be false'
assert 'C: false' in js, 'C default must be false'
assert 'isDummyRoutesVisible = false' in js, 'isDummyRoutesVisible must default to false'

with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

assert '전체 켜기' in html, 'Template button text must be 전체 켜기'
assert 'btn-dummy-course-A" class="dummy-sub-btn"' in html, 'Course A button should not have active class by default'

print('All code verification checks passed successfully!')
