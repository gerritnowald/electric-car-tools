const distancePerYear = Array.from({ length: 301 }, (_, index) => index * 100);

const controls = {
  distance: document.getElementById('distance'),
  battery: document.getElementById('battery'),
  cons100: document.getElementById('cons100'),
  cons120: document.getElementById('cons120'),
  time2080: document.getElementById('time2080'),
  time80100: document.getElementById('time80100'),
  speed: document.getElementById('speed'),
  minSoc: document.getElementById('minSoc'),
  maxSoc: document.getElementById('maxSoc'),
};

const labels = {
  speedValue: document.getElementById('speedValue'),
  minSocValue: document.getElementById('minSocValue'),
  maxSocValue: document.getElementById('maxSocValue'),
};

const summary = {
  time: document.getElementById('summaryTime'),
  energy: document.getElementById('summaryEnergy'),
  avg: document.getElementById('summaryAvg'),
  range: document.getElementById('summaryRange'),
  stops: document.getElementById('summaryStops'),
  endSoc: document.getElementById('summaryEndSoc'),
};

const warning = document.getElementById('warning');

function createChargeCurve(t2080, t80100) {
  const tEnd = t2080 + t80100;
  const A = [
    [0, 0, 0, 1],
    [Math.pow(t2080, 3), Math.pow(t2080, 2), t2080, 1],
    [Math.pow(tEnd, 3), Math.pow(tEnd, 2), tEnd, 1],
    [3 * Math.pow(tEnd, 2), 2 * tEnd, 1, 0],
  ];
  const y = [20, 80, 100, 0];

  const coeffs = solveLinearSystem(A, y);

  return time => coeffs[0] * Math.pow(time, 3) + coeffs[1] * Math.pow(time, 2) + coeffs[2] * time + coeffs[3];
}

function chargeTimeBetweenSoc(startSoc, endSoc, t2080, t80100, chargeCurve) {
  const fullTime = t2080 + t80100;
  if (endSoc <= startSoc) {
    return { chargeTime: 0, startTime: 0, endTime: 0 };
  }

  const sampleCount = 2001;
  const grid = Array.from({ length: sampleCount }, (_, i) => (i / (sampleCount - 1)) * fullTime);
  const curve = grid.map(t => chargeCurve(t));

  const startTime = startSoc <= 20
    ? 0
    : interpolateTimeForSoc(startSoc, grid, curve);
  const endTime = endSoc >= 100
    ? fullTime
    : interpolateTimeForSoc(endSoc, grid, curve);

  return {
    chargeTime: Math.max(0, endTime - startTime),
    startTime,
    endTime,
  };
}

function interpolateTimeForSoc(targetSoc, grid, curve) {
  for (let i = 1; i < grid.length; i += 1) {
    if (curve[i] >= targetSoc) {
      const t0 = grid[i - 1];
      const t1 = grid[i];
      const s0 = curve[i - 1];
      const s1 = curve[i];
      const ratio = (targetSoc - s0) / (s1 - s0 || 1);
      return t0 + ratio * (t1 - t0);
    }
  }
  return grid[grid.length - 1];
}

function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let j = i + 1; j < n; j += 1) {
      if (Math.abs(M[j][i]) > Math.abs(M[pivot][i])) pivot = j;
    }
    [M[i], M[pivot]] = [M[pivot], M[i]];

    const diag = M[i][i];
    for (let k = i; k <= n; k += 1) {
      M[i][k] /= diag;
    }

    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      const factor = M[j][i];
      for (let k = i; k <= n; k += 1) {
        M[j][k] -= factor * M[i][k];
      }
    }
  }

  return M.map(row => row[n]);
}

function travelDistanceOverTime(distanceKm, batteryKwh, consumption, chargeCurve, speedKmh, minSoc, maxSoc) {
  if (distanceKm <= 0 || speedKmh <= 0 || maxSoc <= minSoc) {
    return { times: [0], distances: [0], soc: [100] };
  }

  const firstLegEnergy = batteryKwh * (100 - minSoc) / 100;
  const consumptionValue = consumption(speedKmh);
  const firstLegRange = firstLegEnergy / (consumptionValue / 100);
  const subsequentLegEnergy = batteryKwh * (maxSoc - minSoc) / 100;
  const subsequentLegRange = subsequentLegEnergy / (consumptionValue / 100);

  if (firstLegRange <= 0 || subsequentLegRange <= 0) {
    return { times: [0], distances: [0], soc: [100] };
  }

  const totalChargeTime = Number(controls.time2080.value) + Number(controls.time80100.value);

  const times = [0];
  const distances = [0];
  const soc = [100];
  let remaining = distanceKm;
  let currentTime = 0;
  let currentDistance = 0;
  let isFirstLeg = true;
  let stops = 0;

  while (remaining > 1e-3) {
    const legRange = isFirstLeg ? firstLegRange : subsequentLegRange;
    const driveLeg = Math.min(remaining, legRange);
    const driveTime = driveLeg / speedKmh;
    currentTime += driveTime;
    currentDistance += driveLeg;
    const currentSoc = isFirstLeg
      ? 100 - (100 - minSoc) * (driveLeg / legRange)
      : maxSoc - (maxSoc - minSoc) * (driveLeg / legRange);

    times.push(currentTime);
    distances.push(currentDistance);
    soc.push(currentSoc);
    remaining -= driveLeg;

    if (remaining <= 1e-3) break;

    const chargeResult = chargeTimeBetweenSoc(minSoc, maxSoc, Number(controls.time2080.value), Number(controls.time80100.value), chargeCurve);
    const chargeTimeH = chargeResult.chargeTime / 60;
    const chargeStartTime = chargeResult.startTime;
    const chargeEndTime = chargeResult.endTime;
    const chargeSteps = 20;
    const chargeGrid = Array.from({ length: chargeSteps + 1 }, (_, i) =>
      chargeStartTime + (i / chargeSteps) * (chargeEndTime - chargeStartTime)
    );

    for (let i = 1; i <= chargeSteps; i += 1) {
      const tAbs = chargeGrid[i];
      const socValue = chargeCurve(tAbs);
      const absoluteTime = currentTime + (tAbs - chargeStartTime) / 60;
      times.push(absoluteTime);
      distances.push(currentDistance);
      soc.push(Math.min(Math.max(socValue, 0), 100));
    }

    currentTime += chargeTimeH;
    stops += 1;
    isFirstLeg = false;
  }

  return { times, distances, soc, stops };
}

function calculateConsumption(speed) {
  const x0 = 0;
  const x1 = 100;
  const x2 = 120;
  const y0 = 0;
  const y1 = Number(controls.cons100.value);
  const y2 = Number(controls.cons120.value);

  const denom = (x0 - x1) * (x0 - x2) * (x1 - x2);
  const a = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / denom;
  const b = (x2*x2 * (y0 - y1) + x1*x1 * (y2 - y0) + x0*x0 * (y1 - y2)) / denom;
  const c = (x1 * x2 * (x1 - x2) * y0 + x2 * x0 * (x2 - x0) * y1 + x0 * x1 * (x0 - x1) * y2) / denom;

  return speed => a * speed * speed + b * speed + c;
}

function formatTime(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const minutes = m === 60 ? 0 : m;
  const hoursFinal = m === 60 ? h + 1 : h;
  return `${hoursFinal}:${String(minutes).padStart(2, '0')} h`;
}

function updateValues() {
  labels.speedValue.textContent = controls.speed.value;
  labels.minSocValue.textContent = controls.minSoc.value;
  labels.maxSocValue.textContent = controls.maxSoc.value;
}

function updateSummary(trip) {
  const speed = Number(controls.speed.value);
  const consumptionFn = calculateConsumption(speed);
  const energyNeeded = consumptionFn(speed) * Number(controls.distance.value) / 100;
  const usableRange = Number(controls.battery.value) * ((Number(controls.maxSoc.value) - Number(controls.minSoc.value)) / 100) / consumptionFn(speed) * 100;
  const stops = trip.stops ?? 0;

  summary.time.textContent = formatTime(trip.times[trip.times.length - 1]);
  summary.energy.textContent = `${Math.round(energyNeeded)} kWh`;
  summary.avg.textContent = `${consumptionFn(speed).toFixed(1)} kWh/100km`;
  summary.range.textContent = `${Math.round(usableRange)} km`;
  summary.stops.textContent = `${stops}`;
  summary.endSoc.textContent = `${trip.soc[trip.soc.length - 1].toFixed(1)}%`;
}

function drawChart(trip) {
  chart.data.labels = [];
  chart.data.datasets[0].data = trip.times.map((time, index) => ({ x: time, y: trip.distances[index] }));
  chart.data.datasets[1].data = trip.times.map((time, index) => ({ x: time, y: trip.soc[index] }));
  chart.update();
}

const chartCtx = document.getElementById('travelChart').getContext('2d');
const chart = new Chart(chartCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Distance traveled',
        data: [],
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        tension: 0.25,
        pointRadius: 0,
        yAxisID: 'y',
      },
      {
        label: 'State of charge',
        data: [],
        borderColor: '#ea580c',
        backgroundColor: 'rgba(251,146,60,0.1)',
        tension: 0.25,
        pointRadius: 0,
        yAxisID: 'y1',
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: 'Time (h)' },
      },
      y: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: 'Distance (km)' },
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'State of charge (%)' },
        min: 0,
        max: 100,
        grid: { drawOnChartArea: false },
      },
    },
    plugins: {
      legend: { position: 'top' },
    },
  },
});

function updatePlot() {
  updateValues();

  const distance = Number(controls.distance.value);
  const battery = Number(controls.battery.value);
  const minSoc = Number(controls.minSoc.value);
  const maxSoc = Number(controls.maxSoc.value);
  const speed = Number(controls.speed.value);

  if (maxSoc <= minSoc) {
    warning.style.display = 'block';
    warning.textContent = 'Max State of Charge must be greater than Min State of Charge.';
    return;
  }

  warning.style.display = 'none';

  const chargeCurve = createChargeCurve(Number(controls.time2080.value), Number(controls.time80100.value));
  const consumptionFn = calculateConsumption(speed);
  const trip = travelDistanceOverTime(distance, battery, consumptionFn, chargeCurve, speed, minSoc, maxSoc);

  drawChart(trip);
  updateSummary(trip);
}

Object.values(controls).forEach(control => {
  control.addEventListener('input', updatePlot);
});

updatePlot();
