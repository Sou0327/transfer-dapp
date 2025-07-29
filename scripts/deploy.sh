#!/bin/bash

# Production Deployment Script for Cardano OTC Trading System
# Comprehensive deployment automation with safety checks

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-production}"
COMPOSE_FILE="docker-compose.production.yml"
MONITORING_COMPOSE_FILE="docker-compose.monitoring.yml"
BACKUP_DIR="/tmp/otc-deployment-backup-$(date +%Y%m%d_%H%M%S)"

# Default values
DRY_RUN="${DRY_RUN:-false}"
SKIP_TESTS="${SKIP_TESTS:-false}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"
FORCE_DEPLOY="${FORCE_DEPLOY:-false}"
ENABLE_MONITORING="${ENABLE_MONITORING:-true}"
DOMAIN="${DOMAIN:-localhost}"
BUILD_ARGS="${BUILD_ARGS:-}"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_header() {
    echo -e "${CYAN}[DEPLOY]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Deployment failed with exit code $exit_code"
        log_info "Check logs above for details"
        if [[ -d "${BACKUP_DIR}" ]]; then
            log_info "Backup available at: ${BACKUP_DIR}"
        fi
    fi
    exit $exit_code
}

trap cleanup EXIT
trap 'log_error "Deployment interrupted"; exit 130' INT TERM

# Pre-deployment checks
check_prerequisites() {
    log_header "Checking prerequisites..."
    
    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root for security reasons"
        exit 1
    fi
    
    # Check required commands
    local required_commands=("docker" "docker-compose" "git" "openssl" "curl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command not found: $cmd"
            exit 1
        fi
    done
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running or not accessible"
        exit 1
    fi
    
    # Check Git repository status
    if ! git status &> /dev/null; then
        log_error "Not in a Git repository or Git is not available"
        exit 1
    fi
    
    # Check for uncommitted changes
    if [[ "${FORCE_DEPLOY}" != "true" ]] && ! git diff-index --quiet HEAD --; then
        log_error "There are uncommitted changes in the repository"
        log_info "Use FORCE_DEPLOY=true to deploy anyway, or commit your changes"
        exit 1
    fi
    
    # Check environment file
    if [[ ! -f "${PROJECT_ROOT}/.env.production" ]]; then
        log_error "Production environment file not found: .env.production"
        log_info "Copy .env.production.final to .env.production and configure it"
        exit 1
    fi
    
    # Check SSL certificates
    if [[ "${DOMAIN}" != "localhost" ]] && [[ ! -f "${PROJECT_ROOT}/ssl/fullchain.pem" ]]; then
        log_warning "SSL certificates not found. Run SSL setup first:"
        log_info "  ./scripts/setup-ssl.sh --domain ${DOMAIN} --letsencrypt"
    fi
    
    log_success "Prerequisites check passed"
}

# Backup existing deployment
backup_current_deployment() {
    if [[ "${SKIP_BACKUP}" == "true" ]]; then
        log_info "Skipping backup as requested"
        return 0
    fi
    
    log_header "Creating backup of current deployment..."
    
    mkdir -p "${BACKUP_DIR}"
    
    # Backup database
    if docker-compose -f "${COMPOSE_FILE}" ps postgres | grep -q "Up"; then
        log_info "Backing up database..."
        docker-compose -f "${COMPOSE_FILE}" exec -T postgres pg_dumpall -U postgres > "${BACKUP_DIR}/database_backup.sql"
    fi
    
    # Backup volumes
    log_info "Backing up Docker volumes..."
    docker run --rm -v otc_postgres_data:/source -v "${BACKUP_DIR}:/backup" alpine tar czf /backup/postgres_data.tar.gz -C /source .
    docker run --rm -v otc_redis_data:/source -v "${BACKUP_DIR}:/backup" alpine tar czf /backup/redis_data.tar.gz -C /source .
    
    # Backup configuration files
    log_info "Backing up configuration files..."
    cp -r "${PROJECT_ROOT}/ssl" "${BACKUP_DIR}/" 2>/dev/null || true
    cp "${PROJECT_ROOT}/.env.production" "${BACKUP_DIR}/" 2>/dev/null || true
    
    # Create backup manifest
    cat > "${BACKUP_DIR}/backup_manifest.txt" << EOF
Backup created: $(date)
Git commit: $(git rev-parse HEAD)
Git branch: $(git rev-parse --abbrev-ref HEAD)
Domain: ${DOMAIN}
Environment: ${DEPLOYMENT_ENV}
EOF
    
    log_success "Backup created at: ${BACKUP_DIR}"
}

# Build Docker images
build_images() {
    log_header "Building Docker images..."
    
    # Set build arguments
    local build_date=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    local git_commit=$(git rev-parse HEAD)
    local git_branch=$(git rev-parse --abbrev-ref HEAD)
    local version="${git_branch}-${git_commit:0:8}"
    
    local default_build_args="--build-arg BUILD_DATE=${build_date} --build-arg GIT_COMMIT=${git_commit} --build-arg GIT_BRANCH=${git_branch} --build-arg VERSION=${version}"
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY RUN] Would build images with args: ${default_build_args} ${BUILD_ARGS}"
        return 0
    fi
    
    # Build main application
    log_info "Building main application image..."
    docker build -f Dockerfile.production ${default_build_args} ${BUILD_ARGS} -t otc-app:${version} -t otc-app:latest .
    
    # Build custom nginx image if needed
    if [[ -f "nginx/Dockerfile" ]]; then
        log_info "Building custom nginx image..."
        docker build -f nginx/Dockerfile ${default_build_args} -t otc-nginx:${version} -t otc-nginx:latest nginx/
    fi
    
    log_success "Docker images built successfully"
}

# Run tests
run_tests() {
    if [[ "${SKIP_TESTS}" == "true" ]]; then
        log_info "Skipping tests as requested"
        return 0
    fi
    
    log_header "Running pre-deployment tests..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY RUN] Would run tests"
        return 0
    fi
    
    # Run unit tests
    log_info "Running unit tests..."
    docker run --rm -v "${PROJECT_ROOT}:/app" -w /app node:20-alpine npm test
    
    # Run integration tests with test database
    log_info "Running integration tests..."
    docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit
    docker-compose -f docker-compose.test.yml down -v
    
    # Security scan
    log_info "Running security scan..."
    docker run --rm -v "${PROJECT_ROOT}:/app" -w /app node:20-alpine npm audit --audit-level moderate
    
    log_success "All tests passed successfully"
}

# Deploy services
deploy_services() {
    log_header "Deploying services..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY RUN] Would deploy services using ${COMPOSE_FILE}"
        return 0
    fi
    
    # Stop existing services gracefully
    log_info "Stopping existing services..."
    docker-compose -f "${COMPOSE_FILE}" down --timeout 30 || true
    
    # Pull latest base images
    log_info "Pulling latest base images..."
    docker-compose -f "${COMPOSE_FILE}" pull
    
    # Start core services (database, cache)
    log_info "Starting core services..."
    docker-compose -f "${COMPOSE_FILE}" up -d postgres redis
    
    # Wait for core services to be ready
    log_info "Waiting for core services to be ready..."
    wait_for_service "postgres" "5432" 60
    wait_for_service "redis" "6379" 30
    
    # Run database migrations
    log_info "Running database migrations..."
    docker-compose -f "${COMPOSE_FILE}" run --rm app npm run migrate
    
    # Start remaining services
    log_info "Starting application services..."
    docker-compose -f "${COMPOSE_FILE}" up -d
    
    # Wait for application to be ready
    log_info "Waiting for application to be ready..."
    wait_for_health_check "app" 120
    
    log_success "Services deployed successfully"
}

# Deploy monitoring stack
deploy_monitoring() {
    if [[ "${ENABLE_MONITORING}" != "true" ]]; then
        log_info "Monitoring deployment disabled"
        return 0
    fi
    
    log_header "Deploying monitoring stack..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY RUN] Would deploy monitoring using ${MONITORING_COMPOSE_FILE}"
        return 0
    fi
    
    # Create monitoring network if it doesn't exist
    docker network create otc-network 2>/dev/null || true
    
    # Deploy monitoring services
    log_info "Starting monitoring services..."
    docker-compose -f "${MONITORING_COMPOSE_FILE}" up -d
    
    # Wait for monitoring services
    log_info "Waiting for monitoring services to be ready..."
    wait_for_service "prometheus" "9090" 60
    wait_for_service "grafana" "3000" 60
    
    log_success "Monitoring stack deployed successfully"
}

# Utility functions
wait_for_service() {
    local service_name=$1
    local port=$2
    local timeout=${3:-60}
    local elapsed=0
    local interval=5
    
    log_info "Waiting for ${service_name} on port ${port}..."
    
    while [[ $elapsed -lt $timeout ]]; do
        if docker-compose -f "${COMPOSE_FILE}" exec -T "${service_name}" nc -z localhost "${port}" 2>/dev/null; then
            log_success "${service_name} is ready"
            return 0
        fi
        sleep $interval
        elapsed=$((elapsed + interval))
        echo -n "."
    done
    
    log_error "${service_name} failed to start within ${timeout} seconds"
    return 1
}

wait_for_health_check() {
    local service_name=$1
    local timeout=${2:-60}
    local elapsed=0
    local interval=5
    
    log_info "Waiting for ${service_name} health check..."
    
    while [[ $elapsed -lt $timeout ]]; do
        if docker-compose -f "${COMPOSE_FILE}" ps "${service_name}" | grep -q "healthy"; then
            log_success "${service_name} is healthy"
            return 0
        fi
        sleep $interval
        elapsed=$((elapsed + interval))
        echo -n "."
    done
    
    log_error "${service_name} health check failed within ${timeout} seconds"
    return 1
}

# Post-deployment verification
verify_deployment() {
    log_header "Verifying deployment..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY RUN] Would verify deployment"
        return 0
    fi
    
    # Check service status
    log_info "Checking service status..."
    docker-compose -f "${COMPOSE_FILE}" ps
    
    # Test application endpoints
    log_info "Testing application endpoints..."
    
    # Health check
    if curl -f -s "http://localhost:4000/health" > /dev/null; then
        log_success "Health check endpoint is responding"
    else
        log_error "Health check endpoint is not responding"
        return 1
    fi
    
    # API endpoint
    if curl -f -s "http://localhost:4000/api/status" > /dev/null; then
        log_success "API endpoint is responding"
    else
        log_warning "API endpoint is not responding (this may be expected)"
    fi
    
    # Database connectivity
    log_info "Testing database connectivity..."
    if docker-compose -f "${COMPOSE_FILE}" exec -T postgres psql -U otc_user -d otc_system -c "SELECT 1;" > /dev/null; then
        log_success "Database connectivity verified"
    else
        log_error "Database connectivity failed"
        return 1
    fi
    
    # SSL certificate check (if not localhost)
    if [[ "${DOMAIN}" != "localhost" ]]; then
        log_info "Checking SSL certificate..."
        if openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" < /dev/null 2>/dev/null | openssl x509 -checkend 2592000 -noout; then
            log_success "SSL certificate is valid and not expiring within 30 days"
        else
            log_warning "SSL certificate may be invalid or expiring soon"
        fi
    fi
    
    log_success "Deployment verification completed"
}

# Cleanup old images and containers
cleanup_old_resources() {
    log_header "Cleaning up old resources..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY RUN] Would cleanup old resources"
        return 0
    fi
    
    # Remove dangling images
    log_info "Removing dangling images..."
    docker image prune -f || true
    
    # Remove old containers
    log_info "Removing stopped containers..."
    docker container prune -f || true
    
    # Remove unused networks
    log_info "Removing unused networks..."
    docker network prune -f || true
    
    # Keep only the last 3 versions of our custom images
    log_info "Cleaning up old application images..."
    docker images --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}" | grep "otc-app:" | tail -n +4 | awk '{print $1}' | xargs docker rmi 2>/dev/null || true
    
    log_success "Cleanup completed"
}

# Display deployment summary
show_deployment_summary() {
    log_header "Deployment Summary"
    
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}  Cardano OTC Trading System    ${NC}"
    echo -e "${CYAN}     Deployment Summary         ${NC}"
    echo -e "${CYAN}================================${NC}"
    echo ""
    echo -e "Environment: ${GREEN}${DEPLOYMENT_ENV}${NC}"
    echo -e "Domain: ${GREEN}${DOMAIN}${NC}"
    echo -e "Git Branch: ${GREEN}$(git rev-parse --abbrev-ref HEAD)${NC}"
    echo -e "Git Commit: ${GREEN}$(git rev-parse --short HEAD)${NC}"
    echo -e "Deployment Time: ${GREEN}$(date)${NC}"
    echo ""
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        echo -e "${YELLOW}This was a DRY RUN - no actual changes were made${NC}"
        echo ""
    fi
    
    echo -e "${CYAN}Service URLs:${NC}"
    echo -e "  Application: ${GREEN}https://${DOMAIN}${NC}"
    echo -e "  Admin Panel: ${GREEN}https://${DOMAIN}/admin${NC}"
    echo -e "  Health Check: ${GREEN}https://${DOMAIN}/health${NC}"
    
    if [[ "${ENABLE_MONITORING}" == "true" ]]; then
        echo -e "  Grafana: ${GREEN}https://monitor.${DOMAIN}/grafana${NC}"
        echo -e "  Prometheus: ${GREEN}https://monitor.${DOMAIN}/prometheus${NC}"
        echo -e "  AlertManager: ${GREEN}https://monitor.${DOMAIN}/alertmanager${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo -e "  1. Update DNS records to point to this server"
    echo -e "  2. Configure monitoring alerts and notifications"
    echo -e "  3. Test all critical functionality"
    echo -e "  4. Update documentation and runbooks"
    echo -e "  5. Schedule regular backups and maintenance"
    echo ""
    
    if [[ -d "${BACKUP_DIR}" ]]; then
        echo -e "Backup Location: ${GREEN}${BACKUP_DIR}${NC}"
        echo ""
    fi
    
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
}

# Show help
show_help() {
    cat << 'EOF'
Production Deployment Script for Cardano OTC Trading System

Usage: ./scripts/deploy.sh [OPTIONS]

Options:
    --dry-run              Perform a dry run without making actual changes
    --skip-tests           Skip running tests before deployment
    --skip-backup          Skip creating backup of current deployment
    --force-deploy         Deploy even with uncommitted changes
    --no-monitoring        Skip deploying monitoring stack
    --domain DOMAIN        Set the domain name (default: localhost)
    --build-args ARGS      Additional build arguments for Docker
    --help                 Show this help message

Environment Variables:
    DEPLOYMENT_ENV         Deployment environment (default: production)
    DRY_RUN               Perform dry run (true/false)
    SKIP_TESTS            Skip tests (true/false)
    SKIP_BACKUP           Skip backup (true/false)
    FORCE_DEPLOY          Force deployment (true/false)
    ENABLE_MONITORING     Enable monitoring deployment (true/false)
    DOMAIN                Domain name
    BUILD_ARGS            Additional Docker build arguments

Examples:
    # Standard production deployment
    ./scripts/deploy.sh --domain example.com

    # Dry run to see what would happen
    ./scripts/deploy.sh --dry-run --domain example.com

    # Quick deployment skipping tests and backup
    ./scripts/deploy.sh --skip-tests --skip-backup --domain example.com

    # Force deployment with uncommitted changes
    ./scripts/deploy.sh --force-deploy --domain example.com

Prerequisites:
    - Docker and Docker Compose installed
    - SSL certificates configured (for non-localhost domains)
    - .env.production file configured
    - Git repository with no uncommitted changes (unless --force-deploy)

EOF
}

# Main execution
main() {
    local start_time=$(date +%s)
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --skip-tests)
                SKIP_TESTS="true"
                shift
                ;;
            --skip-backup)
                SKIP_BACKUP="true"
                shift
                ;;
            --force-deploy)
                FORCE_DEPLOY="true"
                shift
                ;;
            --no-monitoring)
                ENABLE_MONITORING="false"
                shift
                ;;
            --domain)
                DOMAIN="$2"
                shift 2
                ;;
            --build-args)
                BUILD_ARGS="$2"
                shift 2
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
    
    # Change to project root
    cd "${PROJECT_ROOT}"
    
    log_header "Starting deployment of Cardano OTC Trading System"
    log_info "Environment: ${DEPLOYMENT_ENV}"
    log_info "Domain: ${DOMAIN}"
    log_info "Dry Run: ${DRY_RUN}"
    
    # Run deployment steps
    check_prerequisites
    backup_current_deployment
    build_images
    run_tests
    deploy_services
    deploy_monitoring
    verify_deployment
    cleanup_old_resources
    
    # Calculate deployment time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log_success "Deployment completed in ${duration} seconds"
    
    # Show summary
    show_deployment_summary
}

# Run main function with all arguments
main "$@"