/** Row visibility / account state — only `active` rows appear in app queries. */
export const RECORD_STATUS = {
  INACTIVE: 'inactive',
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;

export type RecordStatus = (typeof RECORD_STATUS)[keyof typeof RECORD_STATUS];

export const RECORD_STATUS_SQL = `status = '${RECORD_STATUS.ACTIVE}'`;
