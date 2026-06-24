const distancePerYear = Array.from({ length: 301 }, (_, index) => index * 100);

const controls = {
  electricConsumption: document.getElementById('electricConsumption'),
  electricPrice: document.getElementById('electricPrice'),
  electricFixed: document.getElementById('electricFixed'),
  gasolineConsumption: document.getElementById('gasolineConsumption'),
  gasolinePrice: document.getElementById('gasolinePrice'),
  gasolineFixed: document.getElementById('gasolineFixed'),
};

const labels = {
  electricConsumption: document.getElementById('labelElectricConsumption'),
  electricPrice: document.getElementById('labelElectricPrice'),
  electricFixed: document.getElementById('labelElectricFixed'),
  gasolineConsumption: document.getElementById('labelGasolineConsumption'),
  gasolinePrice: document.getElementById('labelGasolinePrice'),
  gasolineFixed: document.getElementById('labelGasolineFixed'),
};

const summaryElectric = document.getElementById('summaryElectric');
const summaryGasoline = document.getElementById('summaryGasoline');
const summaryBreakEven = document.getElementById('summaryBreakEven');

function formatEuro(value) {
  return `€${value.toFixed(2)}`;
}

function calculateCosts() {
  const consumptionElectric = Number(controls.electricConsumption.value);
  const consumptionGasoline = Number(controls.gasolineConsumption.value);
  const priceElectric = Number(controls.electricPrice.value) / 100;
  const priceGasoline = Number(controls.gasolinePrice.value);
  const fixElectric = Number(controls.electricFixed.value);
  const fixGasoline = Number(controls.gasolineFixed.value);

  const costsElectric = distancePerYear.map(distance => distance / 100 * consumptionElectric * priceElectric + fixElectric);
  const costsGasoline = distancePerYear.map(distance => distance / 100 * consumptionGasoline * priceGasoline + fixGasoline);

  return { costsElectric, costsGasoline };
}

function findBreakEven(costsElectric, costsGasoline) {
  for (let i = 0; i < distancePerYear.length; i += 1) {
    if (costsElectric[i] <= costsGasoline[i]) {
      return distancePerYear[i];
    }
  }
  return null;
}

function updateSummary(costsElectric, costsGasoline) {
  summaryElectric.textContent = `Electric (30,000 km): ${formatEuro(costsElectric[costsElectric.length - 1])}`;
  summaryGasoline.textContent = `Gasoline (30,000 km): ${formatEuro(costsGasoline[costsGasoline.length - 1])}`;

  const breakEvenDistance = findBreakEven(costsElectric, costsGasoline);
  summaryBreakEven.textContent = breakEvenDistance === null
    ? 'No break-even within 30,000 km'
    : `Electric breaks even at ${breakEvenDistance.toLocaleString()} km`;
}

function updateLabels() {
  labels.electricConsumption.textContent = Number(controls.electricConsumption.value).toFixed(1);
  labels.electricPrice.textContent = Number(controls.electricPrice.value).toFixed(0);
  labels.electricFixed.textContent = Number(controls.electricFixed.value).toFixed(0);
  labels.gasolineConsumption.textContent = Number(controls.gasolineConsumption.value).toFixed(1);
  labels.gasolinePrice.textContent = Number(controls.gasolinePrice.value).toFixed(2);
  labels.gasolineFixed.textContent = Number(controls.gasolineFixed.value).toFixed(0);
}

const chartContext = document.getElementById('costChart').getContext('2d');
const chart = new Chart(chartContext, {
  type: 'line',
  data: {
    labels: distancePerYear,
    datasets: [
        {
        label: 'Electric',
        borderColor: '#0077cc',
        backgroundColor: 'rgba(0, 119, 204, 0.1)',
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 0,
        data: [],
      },
      {
        label: 'Gasoline',
        borderColor: '#cc5500',
        backgroundColor: 'rgba(204, 85, 0, 0.1)',
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 0,
        data: [],
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        title: { display: true, text: 'Distance per year (km)' },
      },
      y: {
        title: { display: true, text: 'Yearly operating costs (€)' },
        beginAtZero: true,
      },
    },
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: context => `${context.dataset.label}: ${formatEuro(context.parsed.y)}`,
        },
      },
    },
  },
});

function updateChart() {
  updateLabels();
  const { costsElectric, costsGasoline } = calculateCosts();
  chart.data.datasets[0].data = costsElectric;
  chart.data.datasets[1].data = costsGasoline;
  chart.update();
  updateSummary(costsElectric, costsGasoline);
}

Object.values(controls).forEach(control => {
  control.addEventListener('input', updateChart);
});

updateChart();
