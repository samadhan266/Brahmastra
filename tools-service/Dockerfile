FROM python:3.10-slim AS builder

ENV GOPATH=/go \
    PATH=/go/bin:/root/.local/bin:$PATH \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core tools
    whatweb \
    nmap \
    masscan \
    dnsutils \
    curl \
    wget \
    whois \
    jq \
    git \
    unzip \
    perl \
    ruby \
    ruby-dev \
    golang-go \
    build-essential \
    libpcap-dev \
    libssl-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Ruby gems (whatweb is Perl-based, installed via apt above)
RUN gem install wpscan

# Go reconnaissance tools
RUN go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest && \
    go install -v github.com/tomnomnom/assetfinder@latest && \
    go install -v github.com/tomnomnom/waybackurls@latest && \
    go install -v github.com/lc/gau/v2/cmd/gau@latest && \
    go install -v github.com/projectdiscovery/chaos-client/cmd/chaos@latest && \
    go install -v github.com/tomnomnom/unfurl@latest && \
    go install -v github.com/tomnomnom/httprobe@latest && \
    go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest

# Go scanning / exploitation tools
RUN go install -v github.com/OJ/gobuster/v3@latest && \
    go install -v github.com/ffuf/ffuf@latest && \
    go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest && \
    go install -v github.com/hahwul/dalfox/v2@latest

# Python tools
RUN pip install --no-cache-dir \
    dirsearch \
    xsstrike \
    theHarvester \
    urless \
    shodan \
    requests && \
    git clone --depth 1 https://github.com/devanshbatham/ParamSpider /opt/ParamSpider && \
    pip install --no-cache-dir /opt/ParamSpider && \
    git clone --depth 1 https://github.com/ticarpi/jwt_tool /opt/jwt_tool && \
    pip install --no-cache-dir termcolor pycryptodomex ratelimit && \
    ln -sf /opt/jwt_tool/jwt_tool.py /usr/local/bin/jwt_tool

# Clone repos for tools not in pip
RUN git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git /opt/sqlmap && \
    ln -sf /opt/sqlmap/sqlmap.py /usr/local/bin/sqlmap && \
    git clone --depth 1 https://github.com/darkoperator/dnsrecon.git /opt/dnsrecon && \
    git clone --depth 1 https://github.com/GerbenJavado/LinkFinder.git /opt/LinkFinder && \
    pip install --no-cache-dir -r /opt/LinkFinder/requirements.txt && \
    git clone --depth 1 https://github.com/m4ll0k/SecretFinder.git /opt/SecretFinder && \
    pip install --no-cache-dir -r /opt/SecretFinder/requirements.txt

# Feroxbuster binary (Rust, not Go)
RUN curl -sL https://github.com/epi052/feroxbuster/releases/latest/download/x86_64-linux-feroxbuster.tar.gz | \
    tar xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/feroxbuster

# Findomain binary (Rust, not Go)
RUN curl -sL https://github.com/Findomain/Findomain/releases/latest/download/findomain-linux.zip -o /tmp/findomain.zip && \
    unzip /tmp/findomain.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/findomain && \
    rm /tmp/findomain.zip

# ---- Runtime stage ----
FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap \
    masscan \
    dnsutils \
    curl \
    wget \
    whois \
    sslscan \
    jq \
    git \
    unzip \
    perl \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/sullo/nikto.git /opt/nikto && \
    ln -sf /opt/nikto/program/nikto.pl /usr/local/bin/nikto

COPY --from=builder /go/bin/ /usr/local/bin/
COPY --from=builder /usr/local/bin/ /usr/local/bin/
COPY --from=builder /usr/local/lib/ /usr/local/lib/
COPY --from=builder /usr/lib/ /usr/lib/
COPY --from=builder /usr/lib/ruby/ /usr/lib/ruby/
COPY --from=builder /var/lib/gems/ /var/lib/gems/

# Ensure ruby gems are on PATH
ENV PATH=/var/lib/gems/*/bin:/usr/local/bin:/usr/local/sbin:$PATH \
    PYTHONUNBUFFERED=1

# Copy cloned tool repos
COPY --from=builder /opt /opt
RUN chmod +x /opt/sqlmap/sqlmap.py /opt/LinkFinder/linkfinder.py /opt/SecretFinder/SecretFinder.py && \
    ln -sf /opt/sqlmap/sqlmap.py /usr/local/bin/sqlmap && \
    ln -sf /opt/LinkFinder/linkfinder.py /usr/local/bin/linkfinder && \
    ln -sf /opt/SecretFinder/SecretFinder.py /usr/local/bin/secretfinder

# Install Python tools on runtime
RUN pip install --no-cache-dir \
    dirsearch \
    xsstrike \
    theHarvester \
    urless \
    requests && \
    pip install --no-cache-dir /opt/ParamSpider && \
    pip install --no-cache-dir termcolor pycryptodomex ratelimit && \
    ln -sf /opt/ParamSpider/paramspider.py /usr/local/bin/paramspider && \
    ln -sf /opt/jwt_tool/jwt_tool.py /usr/local/bin/jwt_tool

# SecLists will be mounted as a volume

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/

EXPOSE 9000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
