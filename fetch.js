const _fetch = require('node-fetch');

const {
  DateTime
} = require('luxon');

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


function fetchMonthlyStats(reportName, start_date, end_date) {

  var params = new URLSearchParams([
    [`reports[${reportName}][facets][]`, 'prev_period'],
    [`reports[${reportName}][start_date]`, start_date],
    [`reports[${reportName}][end_date]`, end_date],
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

async function fetchStats(name, ranges) {

  let reports = [];

  for (const range of ranges) {

    const {
      start_date,
      end_date
    } = range;

    const report = await fetchMonthlyStats(name, start_date, end_date);

    const {
      data
    } = report;

    const [ _0, month, _1, year ] = new Date(end_date).toDateString().split(' ');

    const sum = data.reduce(function(sum, entry) {
      return sum + entry.y;
    }, 0);

    report.month = month;
    report.sum = sum;
    report.year = year;

    reports.push(report);
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

function createRanges(date, look_back = 1) {

  const ranges = [];

  for (let i = 0; i < look_back; i++) {

    var end_date = DateTime.local().minus({
      month: i + 1
    }).endOf('month').toISO();

    var start_date = DateTime.local().minus({
      month: i + 1
    }).startOf('month').toISO();

    ranges.push({
      start_date,
      end_date
    });
  }

  return ranges;
}

const look_back = 10;
const today = new Date();

const ranges = createRanges(today, look_back);

Promise.all([
  fetchStats('posts', ranges).then(toCSV),
  fetchStats('signups', ranges).then(toCSV)
]).catch(err => {
  console.error(err);

  process.exit(1);
});