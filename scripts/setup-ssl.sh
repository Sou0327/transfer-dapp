#!/bin/bash

# SSL Certificate Setup Script for Cardano OTC Trading System
# Supports both Let's Encrypt and self-signed certificates

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="${DOMAIN:-localhost}"
EMAIL="${SSL_EMAIL:-admin@${DOMAIN}}"
SSL_DIR="./ssl"
LETSENCRYPT_DIR="/etc/letsencrypt"
STAGING="${STAGING:-false}"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "Running as root. Consider using a non-root user for security."
    fi
}

# Create SSL directory
create_ssl_dir() {
    log_info "Creating SSL directory..."
    mkdir -p "${SSL_DIR}"
    chmod 755 "${SSL_DIR}"
}

# Generate self-signed certificate
generate_self_signed() {
    log_info "Generating self-signed SSL certificate for ${DOMAIN}..."
    
    # Generate private key
    openssl genrsa -out "${SSL_DIR}/privkey.pem" 2048
    
    # Generate certificate signing request
    openssl req -new -key "${SSL_DIR}/privkey.pem" -out "${SSL_DIR}/cert.csr" \
        -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=${DOMAIN}/emailAddress=${EMAIL}"
    
    # Generate self-signed certificate
    openssl x509 -req -days 365 -in "${SSL_DIR}/cert.csr" \
        -signkey "${SSL_DIR}/privkey.pem" -out "${SSL_DIR}/fullchain.pem" \
        -extensions v3_req -extfile <(echo "
[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = www.${DOMAIN}
DNS.3 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
")
    
    # Set proper permissions
    chmod 600 "${SSL_DIR}/privkey.pem"
    chmod 644 "${SSL_DIR}/fullchain.pem"
    
    # Clean up CSR
    rm -f "${SSL_DIR}/cert.csr"
    
    log_success "Self-signed certificate generated successfully"
}

# Setup Let's Encrypt certificate
setup_letsencrypt() {
    log_info "Setting up Let's Encrypt certificate for ${DOMAIN}..."
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        log_error "Certbot is not installed. Please install it first:"
        echo "  Ubuntu/Debian: sudo apt-get install certbot"
        echo "  CentOS/RHEL: sudo yum install certbot"
        echo "  macOS: brew install certbot"
        exit 1
    fi
    
    # Prepare certbot arguments
    local certbot_args=(
        "certonly"
        "--standalone"
        "--non-interactive"
        "--agree-tos"
        "--email" "${EMAIL}"
        "--domains" "${DOMAIN}"
    )
    
    # Add staging flag if requested
    if [[ "${STAGING}" == "true" ]]; then
        certbot_args+=("--staging")
        log_warning "Using Let's Encrypt staging environment"
    fi
    
    # Run certbot
    if sudo certbot "${certbot_args[@]}"; then
        # Copy certificates to our SSL directory
        sudo cp "${LETSENCRYPT_DIR}/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/"
        sudo cp "${LETSENCRYPT_DIR}/live/${DOMAIN}/privkey.pem" "${SSL_DIR}/"
        
        # Set proper ownership and permissions
        sudo chown $(whoami):$(whoami) "${SSL_DIR}"/*.pem
        chmod 600 "${SSL_DIR}/privkey.pem"
        chmod 644 "${SSL_DIR}/fullchain.pem"
        
        log_success "Let's Encrypt certificate setup completed"
        
        # Setup renewal cron job
        setup_ssl_renewal
    else
        log_error "Failed to obtain Let's Encrypt certificate"
        log_info "Falling back to self-signed certificate..."
        generate_self_signed
    fi
}

# Setup SSL certificate renewal
setup_ssl_renewal() {
    log_info "Setting up SSL certificate auto-renewal..."
    
    # Create renewal script
    cat > "${SSL_DIR}/renew-ssl.sh" << 'EOF'
#!/bin/bash
# SSL Certificate Renewal Script

set -euo pipefail

DOMAIN="${DOMAIN:-localhost}"
SSL_DIR="./ssl"
LETSENCRYPT_DIR="/etc/letsencrypt"

# Renew certificate
if sudo certbot renew --quiet; then
    # Copy renewed certificates
    if [[ -f "${LETSENCRYPT_DIR}/live/${DOMAIN}/fullchain.pem" ]]; then
        sudo cp "${LETSENCRYPT_DIR}/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/"
        sudo cp "${LETSENCRYPT_DIR}/live/${DOMAIN}/privkey.pem" "${SSL_DIR}/"
        
        # Set proper ownership and permissions
        sudo chown $(whoami):$(whoami) "${SSL_DIR}"/*.pem
        chmod 600 "${SSL_DIR}/privkey.pem"
        chmod 644 "${SSL_DIR}/fullchain.pem"
        
        # Reload nginx
        docker-compose exec nginx nginx -s reload
        
        echo "SSL certificate renewed successfully"
    fi
else
    echo "Certificate renewal failed"
    exit 1
fi
EOF

    chmod +x "${SSL_DIR}/renew-ssl.sh"
    
    # Add to crontab (run twice daily)
    local cron_job="0 2,14 * * * ${PWD}/${SSL_DIR}/renew-ssl.sh >> ${PWD}/logs/ssl-renewal.log 2>&1"
    
    # Check if cron job already exists
    if ! crontab -l 2>/dev/null | grep -q "renew-ssl.sh"; then
        (crontab -l 2>/dev/null; echo "${cron_job}") | crontab -
        log_success "SSL renewal cron job added"
    else
        log_info "SSL renewal cron job already exists"
    fi
}

# Verify SSL certificate
verify_ssl_certificate() {
    log_info "Verifying SSL certificate..."
    
    if [[ -f "${SSL_DIR}/fullchain.pem" && -f "${SSL_DIR}/privkey.pem" ]]; then
        # Check certificate validity
        local cert_info=$(openssl x509 -in "${SSL_DIR}/fullchain.pem" -text -noout)
        local expiry_date=$(echo "$cert_info" | grep "Not After" | cut -d: -f2- | xargs)
        local subject=$(echo "$cert_info" | grep "Subject:" | cut -d: -f2- | xargs)
        
        log_success "SSL certificate is valid"
        echo "  Subject: ${subject}"
        echo "  Expires: ${expiry_date}"
        
        # Check if certificate matches private key
        local cert_hash=$(openssl x509 -noout -modulus -in "${SSL_DIR}/fullchain.pem" | openssl md5)
        local key_hash=$(openssl rsa -noout -modulus -in "${SSL_DIR}/privkey.pem" | openssl md5)
        
        if [[ "${cert_hash}" == "${key_hash}" ]]; then
            log_success "Certificate and private key match"
        else
            log_error "Certificate and private key do not match!"
            exit 1
        fi
    else
        log_error "SSL certificate files not found"
        exit 1
    fi
}

# Generate DH parameters
generate_dhparam() {
    log_info "Generating DH parameters (this may take a while)..."
    
    if [[ ! -f "${SSL_DIR}/dhparam.pem" ]]; then
        openssl dhparam -out "${SSL_DIR}/dhparam.pem" 2048
        chmod 644 "${SSL_DIR}/dhparam.pem"
        log_success "DH parameters generated"
    else
        log_info "DH parameters already exist"
    fi
}

# Create SSL security configuration
create_ssl_security_config() {
    log_info "Creating SSL security configuration..."
    
    cat > "${SSL_DIR}/ssl-security.conf" << 'EOF'
# Modern SSL/TLS configuration for maximum security
# Compatible with modern browsers (IE 11+, Chrome 30+, Firefox 27+)

# SSL Protocols (disable older, insecure protocols)
ssl_protocols TLSv1.2 TLSv1.3;

# SSL Ciphers (prioritize modern, secure ciphers)
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;

# Prefer server ciphers
ssl_prefer_server_ciphers off;

# SSL session settings
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_session_tickets off;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;

# DH parameters
ssl_dhparam /etc/nginx/ssl/dhparam.pem;

# Security headers
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
EOF

    log_success "SSL security configuration created"
}

# Display help
show_help() {
    cat << 'EOF'
SSL Certificate Setup Script for Cardano OTC Trading System

Usage: ./scripts/setup-ssl.sh [OPTIONS]

Options:
    --domain DOMAIN      Domain name for SSL certificate (default: localhost)
    --email EMAIL        Email address for Let's Encrypt (default: admin@domain)
    --letsencrypt       Use Let's Encrypt for SSL certificate
    --self-signed       Generate self-signed certificate (default)
    --staging           Use Let's Encrypt staging environment (testing)
    --verify            Verify existing SSL certificate
    --help              Show this help message

Environment Variables:
    DOMAIN              Domain name (same as --domain)
    SSL_EMAIL           Email address (same as --email)
    STAGING             Use staging environment (true/false)

Examples:
    # Generate self-signed certificate for localhost
    ./scripts/setup-ssl.sh --self-signed

    # Setup Let's Encrypt certificate for production
    ./scripts/setup-ssl.sh --domain example.com --email admin@example.com --letsencrypt

    # Test with Let's Encrypt staging
    ./scripts/setup-ssl.sh --domain example.com --letsencrypt --staging

    # Verify existing certificate
    ./scripts/setup-ssl.sh --verify
EOF
}

# Main execution
main() {
    local ssl_method="self-signed"
    local verify_only=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain)
                DOMAIN="$2"
                shift 2
                ;;
            --email)
                EMAIL="$2"
                shift 2
                ;;
            --letsencrypt)
                ssl_method="letsencrypt"
                shift
                ;;
            --self-signed)
                ssl_method="self-signed"
                shift
                ;;
            --staging)
                STAGING="true"
                shift
                ;;
            --verify)
                verify_only=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    log_info "SSL Certificate Setup for ${DOMAIN}"
    log_info "Method: ${ssl_method}"
    
    check_root
    create_ssl_dir
    
    if [[ "${verify_only}" == "true" ]]; then
        verify_ssl_certificate
        exit 0
    fi
    
    case "${ssl_method}" in
        "letsencrypt")
            setup_letsencrypt
            ;;
        "self-signed")
            generate_self_signed
            ;;
        *)
            log_error "Invalid SSL method: ${ssl_method}"
            exit 1
            ;;
    esac
    
    generate_dhparam
    create_ssl_security_config
    verify_ssl_certificate
    
    log_success "SSL setup completed successfully!"
    log_info "Certificate files:"
    echo "  - ${SSL_DIR}/fullchain.pem"
    echo "  - ${SSL_DIR}/privkey.pem"
    echo "  - ${SSL_DIR}/dhparam.pem"
    echo "  - ${SSL_DIR}/ssl-security.conf"
    
    if [[ "${ssl_method}" == "self-signed" ]]; then
        log_warning "Using self-signed certificate. For production, consider using Let's Encrypt:"
        echo "  ./scripts/setup-ssl.sh --domain yourdomain.com --letsencrypt"
    fi
}

# Run main function with all arguments
main "$@"