const _fetch = require('node-fetch');

function getEnv(...names) {

  const result = {};

  names.forEach(name => {
    const value = process.env[name];

    if (!value) {
      console.error(`missing ${name} environment variable`);
      process.exit(1);
    }

    result[name] = value;
  });

  return result;
}

const {
  DISCOURSE_USERNAME,
  DISCOURSE_KEY,
  DISCOURSE_BASE_URL
} = getEnv(
  'DISCOURSE_USERNAME',
  'DISCOURSE_KEY',
  'DISCOURSE_BASE_URL'
);


function padZero(number, length) {

  str = String(number);

  while (str.length < length) {
    str = '0' + str
  }

  return str;
}

function rateLimit(asyncFn, delay=300) {

  return async function(...args) {

    await new Promise(resolve => {
      setTimeout(resolve, delay);
    });

    return asyncFn(...args);
  };
}

const fetch = rateLimit(_fetch);


function fetchMonthlyStats(reportName, start_date) {

  var params = new URLSearchParams([
    [`reports[${reportName}][facets][]`, 'prev_period'],
    [`reports[${reportName}][start_date]`, start_date],
    [`reports[${reportName}][limit]`, '50'],
    ['api_key', DISCOURSE_KEY],
    ['api_username', DISCOURSE_USERNAME]
  ]);

  const query = params.toString();
  const url = `${DISCOURSE_BASE_URL}/admin/reports/bulk?${query}`;

  return fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json'
    }
  })
  .then(r => r.text())
  .then(text => JSON.parse(text))
  .then(result => {

    const {
      reports,
      error_type
    } = result;

    if (error_type) {
      throw new Error(`fetch error: ${error_type}`);
    }

    const [ report ] = reports;

    return report;
  });
}

async function fetchStats(name, months = 1) {

  const today = new Date();

  const day = today.getUTCDate();
  const month = today.getUTCMonth() + 1;
  const year = today.getUTCFullYear();

  const start_date = `${year}-${padZero(month, 2)}-${padZero(day, 2)}T00:00:00.000Z`;

  let lastReport = await fetchMonthlyStats(name, start_date);

  let reports = [];

  while (months-- > 0) {
    lastReport = await fetchMonthlyStats(name, lastReport.prev_start_date);

    const {
      start_date,
      data
    } = lastReport;

    const [ _0, month, _1, year ] = new Date(start_date).toDateString().split(' ');

    const sum = data.reduce(function(sum, entry) {
      return sum + entry.y;
    }, 0);

    lastReport.month = month;
    lastReport.sum = sum;
    lastReport.year = year;

    reports.push(lastReport);
  }

  const data = reports.map(report => {
    const {
      year,
      month,
      sum
    } = report;

    return {
      month,
      year,
      sum
    };
  });

  return {
    name,
    data
  };
}

function toCSV(report) {

  const fs = require('fs');

  const {
    name,
    data
  } = report;

  const keys = Object.keys(data[0]);

  const header = keys.join(',');
  const entries = data.map(entry => keys.map(key => entry[key]).join(',')).join('\n');

  const csv = `${header}\n${entries}`;

  fs.writeFileSync(`${name}.csv`, csv, 'utf8');

  console.log(`wrote ${name}.csv`);
}

const months = 10;

Promise.all([
  fetchStats('posts', months).then(toCSV),
  fetchStats('signups', months).then(toCSV)
]).catch(err => {
  console.error(err);

  process.exit(1);
});