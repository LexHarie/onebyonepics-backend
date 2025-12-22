// Preload script to disable TLS verification before any modules load
// This is required for DigitalOcean managed databases with self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Also try Bun-specific setting
if (typeof Bun !== 'undefined') {
  (Bun as any).env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
