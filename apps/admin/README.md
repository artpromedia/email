# CEERION Admin Console

Enterprise admin console for CEERION Mail with deliverability insights and comprehensive management features.

## Features

### Admin Management
- **Admin-only Authentication**: Secure session management for administrators
- **User CRUD Operations**: Create, read, update, delete user accounts
- **Role Management**: Assign roles (user, admin, super_admin) with permissions
- **Quota Management**: Set and monitor user storage quotas
- **User Status Control**: Activate, suspend, or deactivate accounts

### Deliverability Dashboard
- **DNS Configuration**: Monitor MX, SPF, DKIM, DMARC, MTA-STS, TLS-RPT records
- **DKIM Key Rotation**: Generate new DKIM keys with automated selector creation
- **DNS Copy Snippets**: One-click copy of DNS records for easy setup
- **Status Monitoring**: Real-time status indicators (Green/Yellow/Red)
- **DMARC & TLS-RPT Ingestion**: Process reports for compliance analysis

### Policy Management
- **MFA Configuration**: Multi-factor authentication policies
- **Password Rules**: Complexity requirements and security policies
- **External Banner**: Configure external email warning banners
- **Trusted Senders**: Organization-wide trusted sender policies

### Security & Compliance
- **Quarantine Management**: Review, release, delete quarantined emails
- **Bulk Operations**: Process multiple quarantined items simultaneously
- **Audit Logging**: Comprehensive activity tracking with filtering
- **Report Export**: Export audit logs and compliance reports

## Quick Start

### Demo Credentials
- **Email**: admin@ceerion.com
- **Password**: admin123

### Development
```bash
cd apps/admin
pnpm install
pnpm run dev
```

Visit http://localhost:3001 to access the admin console.

## Acceptance Criteria ✅

- [x] **Admin Authentication**: Secure login with admin-only access
- [x] **User Management**: Complete CRUD operations for user accounts
- [x] **DKIM Rotation**: Generate new keys with automated DNS updates
- [x] **DNS Monitoring**: Real-time status of all mail-related DNS records
- [x] **Deliverability Insights**: Dashboard with reputation scoring
- [x] **Policy Configuration**: MFA, password rules, external banners
- [x] **Audit Logging**: Comprehensive activity tracking
- [x] **Responsive Design**: Mobile-friendly admin interface
