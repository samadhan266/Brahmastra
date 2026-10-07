export interface BugHunterSkill {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  tools: string[];
  commands: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  estimatedTime: string;
}

export type SkillCategory =
  | 'recon'
  | 'osint'
  | 'network'
  | 'vuln_hunting'
  | 'exploitation'
  | 'reporting'
  | 'cloud';

export const SKILL_CATEGORIES: Record<SkillCategory, { label: string; icon: string; color: string; description: string }> = {
  recon: {
    label: 'RECON',
    icon: '🔍',
    color: 'blue',
    description: 'Subdomain enumeration, asset discovery, attack surface mapping',
  },
  osint: {
    label: 'OSINT',
    icon: '🌐',
    color: 'cyan',
    description: 'Open source intelligence, data leaks, public exposure',
  },
  network: {
    label: 'NETWORK',
    icon: '📡',
    color: 'purple',
    description: 'Port scanning, service detection, network topology',
  },
  vuln_hunting: {
    label: 'VULN HUNT',
    icon: '🎯',
    color: 'orange',
    description: 'Vulnerability scanning, template-based detection, fuzzing',
  },
  exploitation: {
    label: 'EXPLOIT',
    icon: '💥',
    color: 'red',
    description: 'SQL injection, XSS, SSRF, command injection testing',
  },
  reporting: {
    label: 'REPORT',
    icon: '📄',
    color: 'green',
    description: 'Result aggregation, evidence collection, findings report',
  },
  cloud: {
    label: 'CLOUD',
    icon: '☁️',
    color: 'sky',
    description: 'Cloud infrastructure assessment, S3 buckets, IAM, metadata services',
  },
};

export const BUGHUNTER_SKILLS: BugHunterSkill[] = [
  // ─── RECON ───
  {
    id: 'subdomain-enum',
    name: 'Subdomain Enumeration',
    category: 'recon',
    description: 'Discover all subdomains of a target domain using passive and active enumeration techniques.',
    tools: ['subfinder', 'assetfinder', 'findomain', 'chaos-client'],
    commands: [
      'subfinder -d {target} -silent',
      'assetfinder --subs-only {target}',
      'findomain -t {target} -q',
      'chaos -d {target} -silent',
    ],
    difficulty: 'beginner',
    tags: ['subdomains', 'dns', 'enumeration'],
    estimatedTime: '2-5 min',
  },
  {
    id: 'url-harvesting',
    name: 'URL Harvesting',
    category: 'recon',
    description: 'Collect all known URLs for a target from web archives, crawls, and passive sources.',
    tools: ['gau', 'waybackurls', 'katana'],
    commands: [
      'echo {target} | gau --silent',
      'echo {target} | waybackurls',
      'katana -u {target} -d 3 -silent',
    ],
    difficulty: 'beginner',
    tags: ['urls', 'endpoints', 'crawling'],
    estimatedTime: '1-3 min',
  },
  {
    id: 'js-endpoint-extract',
    name: 'JS Endpoint Extraction',
    category: 'recon',
    description: 'Extract API endpoints, secrets, and interesting patterns from JavaScript files.',
    tools: ['gau', 'LinkFinder', 'SecretFinder'],
    commands: [
      'linkfinder -i {target} -o cli',
      'secretfinder -i {target} -o cli',
    ],
    difficulty: 'intermediate',
    tags: ['javascript', 'endpoints', 'secrets', 'api'],
    estimatedTime: '3-8 min',
  },
  {
    id: 'param-discovery',
    name: 'Parameter Discovery',
    category: 'recon',
    description: 'Discover hidden parameters and injection points in web applications.',
    tools: ['ParamSpider', 'arjun'],
    commands: [
      'paramspider -d {target}',
    ],
    difficulty: 'intermediate',
    tags: ['parameters', 'injection-points', 'hidden-params'],
    estimatedTime: '2-5 min',
  },

  {
    id: 'security-headers',
    name: 'Security Headers Check',
    category: 'recon',
    description: 'Audit HTTP security headers (HSTS, CSP, X-Frame-Options, etc.) to identify missing protections and misconfigurations.',
    tools: ['curl'],
    commands: [
      'H=$(curl -sI -L "https://{target}" 2>/dev/null) && echo "=== Security Headers: {target} ===" && echo "" && echo "--- Raw Response Headers ---" && echo "$H" && echo "" && echo "--- Header Audit ---" && for h in strict-transport-security content-security-policy x-frame-options x-content-type-options referrer-policy permissions-policy access-control-allow-origin x-xss-protection; do echo "$H" | grep -qi "$h" 2>/dev/null && echo "  [+] $h" || echo "  [-] $h"; done',
    ],
    difficulty: 'beginner',
    tags: ['headers', 'hsts', 'csp', 'misconfiguration', 'audit'],
    estimatedTime: '1-2 min',
  },

  // ─── CLOUD ───
  {
    id: 's3-bucket-enum',
    name: 'S3 Bucket Enumeration',
    category: 'cloud',
    description: 'Enumerate and audit AWS S3 buckets for public access, misconfigurations, and data exposure.',
    tools: ['aws-cli', 'S3Scanner', 'cloud_enum'],
    commands: [
      'aws s3api list-buckets --query "Buckets[].Name"',
      'S3Scanner --bucket {target}',
      'cloud_enum -k {target}',
    ],
    difficulty: 'beginner',
    tags: ['aws', 's3', 'buckets', 'misconfiguration', 'data-exposure'],
    estimatedTime: '2-5 min',
  },
  {
    id: 'cloud-iam-audit',
    name: 'Cloud IAM Audit',
    category: 'cloud',
    description: 'Audit IAM policies, roles, and permissions to identify privilege escalation paths and over-permissive access.',
    tools: ['aws-cli', 'cloudsplaining', 'principal-mapper'],
    commands: [
      'aws iam list-roles --query "Roles[?AssumeRolePolicyDocument != null]"',
      'cloudsplaining scan-policy-file --input-policy-document policy.json',
      'principal-mapper pmap --aws-profile {profile}',
    ],
    difficulty: 'advanced',
    tags: ['iam', 'privilege-escalation', 'policies', 'least-privilege'],
    estimatedTime: '5-15 min',
  },
  {
    id: 'metadata-service-attack',
    name: 'Cloud Metadata Service',
    category: 'cloud',
    description: 'Exploit SSRF to access cloud instance metadata services (AWS IMDS, GCP, Azure) and extract credentials.',
    tools: ['curl', 'nuclei'],
    commands: [
      'curl -s http://169.254.169.254/latest/meta-data/',
      'curl -s http://169.254.169.254/latest/user-data/',
      'nuclei -u {target} -t dast/vulnerabilities/ssrf/cloud-metadata/',
    ],
    difficulty: 'advanced',
    tags: ['metadata', 'imds', 'ssrf', 'credentials', 'aws', 'gcp', 'azure'],
    estimatedTime: '3-10 min',
  },
  {
    id: 'container-registry-scan',
    name: 'Container Registry Assessment',
    category: 'cloud',
    description: 'Scan container registries for exposed images, vulnerabilities, secrets, and misconfigurations.',
    tools: ['skopeo', 'trivy', 'grype'],
    commands: [
      'skopeo list-tags docker://{registry}/{image}',
      'trivy image {registry}/{image}:{tag}',
      'grype {registry}/{image}:{tag}',
    ],
    difficulty: 'intermediate',
    tags: ['containers', 'docker', 'registry', 'vulnerabilities', 'secrets'],
    estimatedTime: '3-10 min',
  },
  {
    id: 'cloud-service-enum',
    name: 'Cloud Service Discovery',
    category: 'cloud',
    description: 'Discover exposed cloud services, open databases, serverless endpoints, and managed services.',
    tools: ['curl', 'nmap', 'cloud_enum'],
    commands: [
      'nmap -sV -p 27017,5432,3306,6379,9200 {target}',
      'cloud_enum -k {target} -k {target}-dev -k {target}-staging',
    ],
    difficulty: 'intermediate',
    tags: ['cloud', 'services', 'databases', 'serverless', 'discovery'],
    estimatedTime: '3-8 min',
  },

  // ─── OSINT ───
  {
    id: 'whois-lookup',
    name: 'WHOIS & DNS Intel',
    category: 'osint',
    description: 'Gather registration data, nameservers, mail servers, and DNS records for target.',
    tools: ['whois', 'dig', 'nslookup'],
    commands: [
      'whois {target}',
      'dig {target} ANY +noall +answer',
      'dig MX {target}',
      'dig TXT {target}',
      'nslookup -type=SOA {target}',
    ],
    difficulty: 'beginner',
    tags: ['whois', 'dns', 'registration', 'infrastructure'],
    estimatedTime: '1 min',
  },
  {
    id: 'tech-fingerprint',
    name: 'Technology Fingerprint',
    category: 'osint',
    description: 'Identify technologies, frameworks, CMS, and server software used by the target.',
    tools: ['WhatWeb', 'wappalyzer'],
    commands: [
      'whatweb {target} -v',
      'whatweb {target} --color=never',
    ],
    difficulty: 'beginner',
    tags: ['fingerprinting', 'technologies', 'cms', 'server'],
    estimatedTime: '1-2 min',
  },
  {
    id: 'email-osint',
    name: 'Email & Credential Intel',
    category: 'osint',
    description: 'Search for leaked credentials, email patterns, and breach data associated with the target.',
    tools: ['h8mail', 'theHarvester'],
    commands: [
      'theHarvester -d {target} -b all',
    ],
    difficulty: 'intermediate',
    tags: ['email', 'breaches', 'credentials', 'leaks'],
    estimatedTime: '3-10 min',
  },
  {
    id: 'cloud-exposure',
    name: 'Cloud Exposure Check',
    category: 'osint',
    description: 'Check for exposed cloud storage buckets, serverless functions, and misconfigurations.',
    tools: ['S3Scanner', 'cloud_enum'],
    commands: [
      'cloud_enum -k {target}',
    ],
    difficulty: 'intermediate',
    tags: ['aws', 'gcp', 'azure', 's3', 'cloud'],
    estimatedTime: '2-5 min',
  },

  // ─── NETWORK ───
  {
    id: 'port-scan-full',
    name: 'Full Port Scan',
    category: 'network',
    description: 'Comprehensive TCP/UDP port scan with service version detection and OS fingerprinting.',
    tools: ['RustScan', 'masscan', 'nmap'],
    commands: [
      'rustscan -a {target} -- -sV -sC',
      'masscan {target} -p0-65535 --rate=1000',
      'nmap -sS -sV -O -p- {target} -oX nmap_full.xml',
    ],
    difficulty: 'beginner',
    tags: ['ports', 'services', 'version-detection', 'os-detection'],
    estimatedTime: '5-20 min',
  },
  {
    id: 'web-server-audit',
    name: 'Web Server Audit',
    category: 'network',
    description: 'Audit web server configuration, headers, SSL/TLS, and common misconfigurations.',
    tools: ['sslscan', 'testssl', 'nikto'],
    commands: [
      'sslscan {target}',
      'nikto -h {target} -o nikto_report.html',
    ],
    difficulty: 'intermediate',
    tags: ['web-server', 'headers', 'ssl', 'tls', 'misconfiguration'],
    estimatedTime: '3-8 min',
  },
  {
    id: 'directory-bruteforce',
    name: 'Directory Bruteforce',
    category: 'network',
    description: 'Discover hidden directories, files, and endpoints using wordlist-based brute-force.',
    tools: ['gobuster', 'feroxbuster', 'dirsearch'],
    commands: [
      'gobuster dir -u {target} -w {SECLISTS}/Discovery/Web-Content/common.txt -t 50',
      'feroxbuster -u {target} -w {SECLISTS}/Discovery/Web-Content/common.txt',
      'dirsearch -u {target} -e php,html,js -t 50',
    ],
    difficulty: 'beginner',
    tags: ['directories', 'files', 'bruteforce', 'wordlist'],
    estimatedTime: '3-10 min',
  },
  {
    id: 'vhost-discovery',
    name: 'Virtual Host Discovery',
    category: 'network',
    description: 'Discover virtual hosts and hidden websites hosted on the same IP address.',
    tools: ['ffuf', 'gobuster'],
    commands: [
      'gobuster vhost -u {target} -w {SECLISTS}/Discovery/DNS/subdomains-top1million-5000.txt',
    ],
    difficulty: 'intermediate',
    tags: ['virtual-hosts', 'vhost', 'shared-hosting'],
    estimatedTime: '2-5 min',
  },

  // ─── VULN HUNTING ───
  {
    id: 'nuclei-scan',
    name: 'Nuclei Template Scan',
    category: 'vuln_hunting',
    description: 'Run comprehensive vulnerability scan using nuclei YAML templates across all categories.',
    tools: ['nuclei'],
    commands: [
      'nuclei -u {target} -severity critical,high,medium -o nuclei_results.txt',
      'nuclei -u {target} -t cves/ -severity critical,high',
      'nuclei -u {target} -t http/exposures/ -t http/misconfiguration/',
    ],
    difficulty: 'beginner',
    tags: ['nuclei', 'templates', 'cves', 'misconfiguration'],
    estimatedTime: '5-15 min',
  },
  {
    id: 'sqli-scan',
    name: 'SQL Injection Testing',
    category: 'vuln_hunting',
    description: 'Test for SQL injection vulnerabilities across all input parameters and URL paths.',
    tools: ['nuclei', 'sqlmap'],
    commands: [
      'nuclei -u {target} -t dast/vulnerabilities/sqli/ -dast',
      'sqlmap -u "{target}/?id=1" --batch --level=5 --risk=3',
      'sqlmap -u "{target}" --forms --batch --crawl=3',
    ],
    difficulty: 'advanced',
    tags: ['sqli', 'injection', 'database', 'sqlmap'],
    estimatedTime: '10-30 min',
  },
  {
    id: 'xss-scan',
    name: 'XSS Detection',
    category: 'vuln_hunting',
    description: 'Scan for reflected, stored, and DOM-based cross-site scripting vulnerabilities.',
    tools: ['dalfox', 'nuclei', 'xsstrike'],
    commands: [
      'dalfox url {target} --skip-mining-all',
      'nuclei -u {target} -t dast/vulnerabilities/xss/ -dast',
      'xsstrike -u {target} --crawl',
    ],
    difficulty: 'advanced',
    tags: ['xss', 'cross-site-scripting', 'dom', 'reflected'],
    estimatedTime: '5-15 min',
  },
  {
    id: 'ssrf-test',
    name: 'SSRF & LFI Testing',
    category: 'vuln_hunting',
    description: 'Test for Server-Side Request Forgery and Local File Inclusion vulnerabilities.',
    tools: ['ffuf', 'nuclei'],
    commands: [
      'nuclei -u {target} -t dast/vulnerabilities/ssrf/ -dast',
      'nuclei -u {target} -t dast/vulnerabilities/lfi/ -dast',
    ],
    difficulty: 'advanced',
    tags: ['ssrf', 'lfi', 'file-inclusion', 'server-side'],
    estimatedTime: '5-10 min',
  },

  // ─── EXPLOITATION ───
  {
    id: 'auth-bypass',
    name: 'Authentication Bypass',
    category: 'exploitation',
    description: 'Test for authentication bypass, default credentials, and weak login mechanisms.',
    tools: ['nuclei', 'hydra', 'zaproxy'],
    commands: [
      'nuclei -u {target} -t http/default-logins/',
      'nuclei -u {target} -t http/exposed-panels/',
    ],
    difficulty: 'advanced',
    tags: ['authentication', 'bypass', 'default-credentials', 'brute-force'],
    estimatedTime: '10-20 min',
  },
  {
    id: 'api-testing',
    name: 'API Security Testing',
    category: 'exploitation',
    description: 'Test REST/GraphQL APIs for broken object authorization, mass assignment, and injection.',
    tools: ['ffuf', 'nuclei', 'zaproxy'],
    commands: [
      'nuclei -u {target} -t http/misconfiguration/graphql/',
      'nuclei -u {target} -t http/exposures/apis/',
    ],
    difficulty: 'advanced',
    tags: ['api', 'rest', 'graphql', 'bola', 'idor'],
    estimatedTime: '10-30 min',
  },
  {
    id: 'cmsscan',
    name: 'CMS Exploitation',
    category: 'exploitation',
    description: 'Scan and exploit CMS-specific vulnerabilities in WordPress, Joomla, Drupal, and others.',
    tools: ['nuclei', 'wpscan', 'joomscan'],
    commands: [
      'nuclei -u {target} -t http/technologies/wordpress/',
      'nuclei -u {target} -t http/vulnerabilities/wordpress/',
    ],
    difficulty: 'intermediate',
    tags: ['wordpress', 'joomla', 'drupal', 'cms'],
    estimatedTime: '5-15 min',
  },
  {
    id: 'ssrf-rce-chain',
    name: 'SSRF to RCE Chain',
    category: 'exploitation',
    description: 'Chain SSRF vulnerabilities to achieve remote code execution via internal services.',
    tools: ['curl', 'nuclei'],
    commands: [
      'nuclei -u {target} -t dast/vulnerabilities/ssrf/ -dast',
    ],
    difficulty: 'advanced',
    tags: ['ssrf', 'rce', 'chain', 'internal-services'],
    estimatedTime: '15-30 min',
  },

  // ─── REPORTING ───
  {
    id: 'result-aggregation',
    name: 'Result Aggregation',
    category: 'reporting',
    description: 'Aggregate and deduplicate findings from all scan phases into a unified view.',
    tools: ['jq'],
    commands: [
      'cat nuclei_results.txt | sort -u',
      'cat nmap_full.xml | grep "open"',
    ],
    difficulty: 'beginner',
    tags: ['aggregation', 'dedup', 'merge'],
    estimatedTime: '1-2 min',
  },
  {
    id: 'cvss-scoring',
    name: 'CVSS Risk Scoring',
    category: 'reporting',
    description: 'Calculate CVSS scores for discovered vulnerabilities and prioritize remediation.',
    tools: ['nuclei'],
    commands: [
      'nuclei -u {target} -severity critical,high -json | jq -r \'select(.info.severity)\'',
    ],
    difficulty: 'intermediate',
    tags: ['cvss', 'scoring', 'risk', 'prioritization'],
    estimatedTime: '1-3 min',
  },
  {
    id: 'executive-summary',
    name: 'Executive Summary',
    category: 'reporting',
    description: 'Generate executive-level summary with risk ratings, affected assets, and recommendations.',
    tools: [],
    commands: [],
    difficulty: 'beginner',
    tags: ['summary', 'executive', 'risk-rating'],
    estimatedTime: '2-5 min',
  },
];
