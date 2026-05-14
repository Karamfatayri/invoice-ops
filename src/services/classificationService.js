const VENDOR_CATEGORIES = {
  'AWS': 'cloud', 'Google Cloud': 'cloud', 'Azure': 'cloud', 'DigitalOcean': 'cloud',
  'Datadog': 'monitoring', 'New Relic': 'monitoring', 'Grafana': 'monitoring', 'PagerDuty': 'monitoring',
  'Snowflake': 'data', 'BigQuery': 'data', 'Databricks': 'data', 'Redshift': 'data',
  'Confluent': 'streaming', 'Kafka': 'streaming',
  'MongoDB': 'database', 'PostgreSQL': 'database', 'Redis': 'database', 'CockroachDB': 'database',
  'HashiCorp': 'devops', 'GitLab': 'devops', 'GitHub': 'devops', 'CircleCI': 'devops',
  'Elastic': 'search', 'Algolia': 'search',
  'Cloudflare': 'cdn', 'Fastly': 'cdn', 'Akamai': 'cdn',
  'CrowdStrike': 'security', 'Okta': 'security', 'Auth0': 'security',
};

const COST_CENTER_RULES = {
  cloud: 'CC-INFRA',
  monitoring: 'CC-OPS',
  data: 'CC-DATA',
  streaming: 'CC-DATA',
  database: 'CC-INFRA',
  devops: 'CC-ENG',
  search: 'CC-ENG',
  cdn: 'CC-INFRA',
  security: 'CC-SEC',
};

function classify(vendorName, amount) {
  const category = VENDOR_CATEGORIES[vendorName] || 'other';
  const costCenter = COST_CENTER_RULES[category] || 'CC-GENERAL';

  // Simple project assignment based on amount
  let environment = 'production';
  if (amount < 500) environment = 'dev';
  else if (amount < 2000) environment = 'staging';

  return {
    category,
    costCenter,
    environment,
    team: 'engineering',
    project: `proj-${category}`,
  };
}

module.exports = { classify, VENDOR_CATEGORIES };
