#!/bin/bash

apt-get update
apt-get install -y apache2

# To install the Stackdriver monitoring agent:
curl -sSO https://repo.stackdriver.com/stack-install.sh
sudo bash stack-install.sh --write-gcm

# To install the Stackdriver logging agent:
curl -sSO https://dl.google.com/cloudagents/install-logging-agent.sh
sudo bash install-logging-agent.sh

VALUE_OF_FOO=$(curl http://metadata.google.internal/computeMetadata/v1/instance/attributes/foo -H "Metadata-Flavor: Google")
cat <<EOF > /var/www/html/index.html
<html><body><h1>Manjares con el Lucho</h1>
<p>Estamos en proceso de construccion:      $VALUE_OF_FOO</p>
</body></html>
EOF

sudo python -m SimpleHTTPServer 8080