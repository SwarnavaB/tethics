import { VERIFICATION_STATUSES, STATUS_BADGES } from './constants.js';

export function getVerificationBadge(status) {
  return STATUS_BADGES[status] ?? STATUS_BADGES[VERIFICATION_STATUSES.UNKNOWN];
}

export function renderVerificationBadge(status, message) {
  const badge = getVerificationBadge(status);
  return `<div class="badge ${badge.className}">${badge.label}${message ? ` - ${message}` : ''}</div>`;
}
