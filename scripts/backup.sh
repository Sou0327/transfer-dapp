#!/bin/bash

# Database Backup Script for Cardano OTC Trading System
# Automated PostgreSQL backup with rotation and compression

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-otc_system}"
DB_USER="${DB_USER:-otc_user}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
COMPRESSION="${BACKUP_COMPRESSION:-gzip}"
SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"

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

# Create backup directory
create_backup_dir() {
    if [[ ! -d "${BACKUP_DIR}" ]]; then
        log_info "Creating backup directory: ${BACKUP_DIR}"
        mkdir -p "${BACKUP_DIR}"
    fi
    
    # Ensure proper permissions
    chmod 755 "${BACKUP_DIR}"
}

# Wait for database to be ready
wait_for_database() {
    log_info "Waiting for database to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ ${attempt} -le ${max_attempts} ]]; do
        if pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
            log_success "Database is ready"
            return 0
        fi
        
        log_info "Attempt ${attempt}/${max_attempts}: Database not ready, waiting..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Database is not ready after ${max_attempts} attempts"
    exit 1
}

# Perform database backup
backup_database() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_file="${BACKUP_DIR}/otc_backup_${timestamp}.sql"
    local compressed_file=""
    
    log_info "Starting database backup..."
    log_info "Database: ${DB_NAME} on ${DB_HOST}:${DB_PORT}"
    log_info "Backup file: ${backup_file}"
    
    # Create backup with pg_dump
    if pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --no-password \
        --verbose \
        --clean \
        --if-exists \
        --create \
        --format=plain \
        --encoding=UTF8 \
        > "${backup_file}"; then
        
        log_success "Database backup created: ${backup_file}"
        
        # Compress backup if requested
        case "${COMPRESSION}" in
            "gzip")
                compressed_file="${backup_file}.gz"
                log_info "Compressing backup with gzip..."
                if gzip "${backup_file}"; then
                    log_success "Backup compressed: ${compressed_file}"
                    backup_file="${compressed_file}"
                else
                    log_warning "Failed to compress backup, keeping uncompressed"
                fi
                ;;
            "bzip2")
                compressed_file="${backup_file}.bz2"
                log_info "Compressing backup with bzip2..."
                if bzip2 "${backup_file}"; then
                    log_success "Backup compressed: ${compressed_file}"
                    backup_file="${compressed_file}"
                else
                    log_warning "Failed to compress backup, keeping uncompressed"
                fi
                ;;
            "none")
                log_info "No compression requested"
                ;;
            *)
                log_warning "Unknown compression method: ${COMPRESSION}, skipping compression"
                ;;
        esac
        
        # Verify backup file exists and has content
        if [[ -f "${backup_file}" && -s "${backup_file}" ]]; then
            local file_size=$(stat -f%z "${backup_file}" 2>/dev/null || stat -c%s "${backup_file}" 2>/dev/null || echo "unknown")
            log_success "Backup verification successful (size: ${file_size} bytes)"
            
            # Set proper permissions
            chmod 600 "${backup_file}"
            
            return 0
        else
            log_error "Backup verification failed: file is missing or empty"
            return 1
        fi
    else
        log_error "Database backup failed"
        return 1
    fi
}

# Clean up old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
    
    local files_deleted=0
    
    # Find and remove old backup files
    if find "${BACKUP_DIR}" -name "otc_backup_*.sql*" -type f -mtime +${RETENTION_DAYS} -print0 | while IFS= read -r -d '' file; do
        log_info "Removing old backup: $(basename "${file}")"
        rm -f "${file}"
        ((files_deleted++))
    done; then
        if [[ ${files_deleted} -gt 0 ]]; then
            log_success "Cleaned up ${files_deleted} old backup files"
        else
            log_info "No old backup files to clean up"
        fi
    else
        log_warning "Failed to clean up some old backup files"
    fi
}

# Generate backup report
generate_backup_report() {
    local report_file="${BACKUP_DIR}/backup_report_$(date '+%Y%m%d').txt"
    
    log_info "Generating backup report..."
    
    {
        echo "Cardano OTC Trading System - Backup Report"
        echo "========================================"
        echo "Date: $(date)"
        echo "Database: ${DB_NAME}"
        echo "Host: ${DB_HOST}:${DB_PORT}"
        echo ""
        echo "Recent Backups:"
        echo "==============="
        
        # List recent backups (last 10)
        find "${BACKUP_DIR}" -name "otc_backup_*.sql*" -type f -printf "%T@ %Tc %s %p\n" 2>/dev/null | \
            sort -nr | head -10 | while read -r timestamp date_str size path; do
            local file_name=$(basename "${path}")
            local size_mb=$((size / 1024 / 1024))
            echo "${date_str} - ${file_name} (${size_mb}MB)"
        done
        
        echo ""
        echo "Disk Usage:"
        echo "==========="
        du -sh "${BACKUP_DIR}" 2>/dev/null || echo "Unable to calculate disk usage"
        
        echo ""
        echo "Configuration:"
        echo "============="
        echo "Retention: ${RETENTION_DAYS} days"
        echo "Compression: ${COMPRESSION}"
        echo "Schedule: ${SCHEDULE}"
        
    } > "${report_file}"
    
    log_success "Backup report generated: ${report_file}"
}

# Send notification (if configured)
send_notification() {
    local status="$1"
    local message="$2"
    
    # Email notification (if configured)
    if [[ -n "${NOTIFICATION_EMAIL:-}" && -n "${SMTP_HOST:-}" ]]; then
        local subject="OTC Backup ${status}: $(date '+%Y-%m-%d %H:%M:%S')"
        
        echo "${message}" | \
            mail -s "${subject}" \
                 -S smtp="${SMTP_HOST}" \
                 -S from="${FROM_EMAIL:-backup@otc.local}" \
                 "${NOTIFICATION_EMAIL}" || \
            log_warning "Failed to send email notification"
    fi
    
    # Webhook notification (if configured)
    if [[ -n "${WEBHOOK_URL:-}" ]]; then
        local payload="{\"status\":\"${status}\",\"message\":\"${message}\",\"timestamp\":\"$(date -Iseconds)\"}"
        
        curl -X POST \
             -H "Content-Type: application/json" \
             -d "${payload}" \
             "${WEBHOOK_URL}" || \
            log_warning "Failed to send webhook notification"
    fi
}

# Test backup restore (optional verification)
test_backup_restore() {
    local backup_file="$1"
    local test_db="${DB_NAME}_test_$(date '+%Y%m%d_%H%M%S')"
    
    log_info "Testing backup restore (optional verification)..."
    
    # Create test database
    if createdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${test_db}" >/dev/null 2>&1; then
        # Restore backup to test database
        local restore_command
        case "${backup_file##*.}" in
            "gz")
                restore_command="gunzip -c '${backup_file}' | psql -h '${DB_HOST}' -p '${DB_PORT}' -U '${DB_USER}' -d '${test_db}'"
                ;;
            "bz2")
                restore_command="bunzip2 -c '${backup_file}' | psql -h '${DB_HOST}' -p '${DB_PORT}' -U '${DB_USER}' -d '${test_db}'"
                ;;
            *)
                restore_command="psql -h '${DB_HOST}' -p '${DB_PORT}' -U '${DB_USER}' -d '${test_db}' < '${backup_file}'"
                ;;
        esac
        
        if eval "${restore_command}" >/dev/null 2>&1; then
            log_success "Backup restore test successful"
            
            # Clean up test database
            dropdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${test_db}" >/dev/null 2>&1 || \
                log_warning "Failed to clean up test database: ${test_db}"
            
            return 0
        else
            log_error "Backup restore test failed"
            
            # Clean up test database
            dropdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${test_db}" >/dev/null 2>&1 || \
                log_warning "Failed to clean up test database: ${test_db}"
            
            return 1
        fi
    else
        log_error "Failed to create test database for restore verification"
        return 1
    fi
}

# Main backup function
perform_backup() {
    local start_time=$(date +%s)
    local backup_successful=false
    local latest_backup=""
    
    log_info "Starting backup process..."
    
    # Create backup directory
    create_backup_dir
    
    # Wait for database
    wait_for_database
    
    # Perform backup
    if backup_database; then
        backup_successful=true
        
        # Find the latest backup file
        latest_backup=$(find "${BACKUP_DIR}" -name "otc_backup_*.sql*" -type f -printf "%T@ %p\n" 2>/dev/null | \
                       sort -nr | head -1 | cut -d' ' -f2-)
        
        # Optional: Test backup restore
        if [[ "${TEST_RESTORE:-false}" == "true" && -n "${latest_backup}" ]]; then
            test_backup_restore "${latest_backup}"
        fi
    fi
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Generate report
    generate_backup_report
    
    # Calculate duration
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Send notification
    if [[ "${backup_successful}" == "true" ]]; then
        local message="Backup completed successfully in ${duration} seconds.\nBackup file: $(basename "${latest_backup}")"
        log_success "Backup process completed in ${duration} seconds"
        send_notification "SUCCESS" "${message}"
    else
        local message="Backup failed after ${duration} seconds."
        log_error "Backup process failed after ${duration} seconds"
        send_notification "FAILED" "${message}"
        exit 1
    fi
}

# Display help
show_help() {
    cat << 'EOF'
Database Backup Script for Cardano OTC Trading System

Usage: ./scripts/backup.sh [OPTIONS]

Options:
    --once              Run backup once and exit
    --daemon            Run as daemon with scheduled backups
    --test-restore      Test backup restore after creation
    --cleanup-only      Only perform cleanup of old backups
    --report-only       Only generate backup report
    --help              Show this help message

Environment Variables:
    DB_HOST                 Database host (default: postgres)
    DB_PORT                 Database port (default: 5432)
    DB_NAME                 Database name (default: otc_system)
    DB_USER                 Database user (default: otc_user)
    PGPASSWORD              Database password (required)
    BACKUP_DIR              Backup directory (default: /backups)
    BACKUP_RETENTION_DAYS   Days to keep backups (default: 30)
    BACKUP_COMPRESSION      Compression method: gzip, bzip2, none (default: gzip)
    BACKUP_SCHEDULE         Cron schedule (default: 0 2 * * *)
    TEST_RESTORE            Test restore after backup (default: false)
    NOTIFICATION_EMAIL      Email for notifications
    SMTP_HOST               SMTP server for email notifications
    FROM_EMAIL              From email address
    WEBHOOK_URL             Webhook URL for notifications

Examples:
    # Run backup once
    ./scripts/backup.sh --once

    # Run as daemon with default schedule
    ./scripts/backup.sh --daemon

    # Run backup with restore test
    TEST_RESTORE=true ./scripts/backup.sh --once

    # Only cleanup old backups
    ./scripts/backup.sh --cleanup-only
EOF
}

# Main execution
main() {
    local mode="once"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --once)
                mode="once"
                shift
                ;;
            --daemon)
                mode="daemon"
                shift
                ;;
            --test-restore)
                TEST_RESTORE="true"
                shift
                ;;
            --cleanup-only)
                mode="cleanup"
                shift
                ;;
            --report-only)
                mode="report"
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
    
    # Validate required environment variables
    if [[ -z "${PGPASSWORD:-}" ]]; then
        log_error "PGPASSWORD environment variable is required"
        exit 1
    fi
    
    log_info "Database Backup Script for OTC Trading System"
    log_info "Mode: ${mode}"
    
    case "${mode}" in
        "once")
            perform_backup
            ;;
        "daemon")
            log_info "Starting backup daemon with schedule: ${SCHEDULE}"
            while true; do
                perform_backup
                log_info "Next backup scheduled according to: ${SCHEDULE}"
                sleep 86400  # Sleep for 24 hours, actual scheduling handled by cron
            done
            ;;
        "cleanup")
            create_backup_dir
            cleanup_old_backups
            ;;
        "report")
            create_backup_dir
            generate_backup_report
            ;;
        *)
            log_error "Invalid mode: ${mode}"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"