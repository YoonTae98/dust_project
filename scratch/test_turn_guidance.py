import math

def calculateBearing(p1, p2):
    y = math.sin(math.radians(p2[1] - p1[1])) * math.cos(math.radians(p2[0]))
    x = math.cos(math.radians(p1[0])) * math.sin(math.radians(p2[0])) - \
        math.sin(math.radians(p1[0])) * math.cos(math.radians(p2[0])) * math.cos(math.radians(p2[1] - p1[1]))
    return (math.degrees(math.atan2(y, x)) + 360) % 360

def getDistanceMeters(c1, c2):
    R = 6371e3
    phi1 = math.radians(c1[0])
    phi2 = math.radians(c2[0])
    delta_phi = math.radians(c2[0] - c1[0])
    delta_lambda = math.radians(c2[1] - c1[1])
    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# 도로 모의: 직진 후 우회전 경로
points = [
    [35.840, 128.490],
    [35.841, 128.490], # 111m 직진
    [35.842, 128.490], # 111m 직진
    [35.842, 128.491], # 우회전 (동쪽으로)
    [35.842, 128.492]
]

# Step 0에서 회전 지점 탐색
totalPoints = len(points)
curIndex = 0

accDistMeters = 0
turnType = 'straight'
turnDistance = 0
turnFound = False

for i in range(curIndex, totalPoints - 1):
    stepDist = getDistanceMeters(points[i], points[i+1])
    accDistMeters += stepDist
    if i + 2 < totalPoints:
        h1 = calculateBearing(points[i], points[i+1])
        h2 = calculateBearing(points[i+1], points[i+2])
        angleDiff = (h2 - h1) % 360
        if angleDiff < -180: angleDiff += 360
        if angleDiff > 180: angleDiff -= 360
        if abs(angleDiff) >= 32:
            turnFound = True
            turnDistance = round(accDistMeters)
            turnType = 'right' if angleDiff > 0 else 'left'
            break

print(f"Step 0: turnFound={turnFound}, turnDistance={turnDistance}m, turnType={turnType}")
assert turnFound == True
assert turnType == 'right'
assert 200 < turnDistance < 250

# Step 1 (한 걸음 전진)
curIndex = 1
accDistMeters = 0
turnDistance = 0
for i in range(curIndex, totalPoints - 1):
    stepDist = getDistanceMeters(points[i], points[i+1])
    accDistMeters += stepDist
    if i + 2 < totalPoints:
        h1 = calculateBearing(points[i], points[i+1])
        h2 = calculateBearing(points[i+1], points[i+2])
        angleDiff = (h2 - h1) % 360
        if angleDiff < -180: angleDiff += 360
        if angleDiff > 180: angleDiff -= 360
        if abs(angleDiff) >= 32:
            turnDistance = round(accDistMeters)
            break

print(f"Step 1: turnDistance={turnDistance}m")
assert 100 < turnDistance < 130
print("Algorithm test passed successfully!")
