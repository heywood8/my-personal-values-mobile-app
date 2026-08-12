#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const COVERAGE_FILE = path.join(__dirname, '../coverage/coverage-summary.json');
const BADGE_DIR = path.join(__dirname, '../coverage');

const coverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
const total = coverage.total;

const badges = [
  { name: 'statements', value: total.statements.pct },
  { name: 'branches', value: total.branches.pct },
  { name: 'functions', value: total.functions.pct },
  { name: 'lines', value: total.lines.pct },
];

function getColor(percentage) {
  if (percentage >= 80) return 'brightgreen';
  if (percentage >= 60) return 'green';
  if (percentage >= 40) return 'yellow';
  if (percentage >= 20) return 'orange';
  return 'red';
}

function downloadBadge(name, value) {
  return new Promise((resolve, reject) => {
    const color = getColor(value);
    const url = `https://img.shields.io/badge/${encodeURIComponent(name)}-${value}%25-${color}.svg?style=flat&logo=jest&logoColor=white`;
    const outputPath = path.join(BADGE_DIR, `badge-${name}.svg`);

    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download badge for ${name}: ${res.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(outputPath);
      res.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`✓ Generated badge-${name}.svg (${value}%)`);
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(outputPath, () => reject(err));
      });
    }).on('error', reject);
  });
}

async function generateAllBadges() {
  console.log('Generating coverage badges...\n');

  try {
    await Promise.all(badges.map(({ name, value }) => downloadBadge(name, value)));
    console.log('\nAll badges generated successfully!');
  } catch (error) {
    // A badge is decoration; failing the coverage run over an unreachable
    // shields.io would be worse than shipping a stale SVG.
    console.warn('\nCould not generate badges:', error.message);
  }
}

generateAllBadges();
