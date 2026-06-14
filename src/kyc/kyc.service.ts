import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class KycService {
  constructor(private db: DatabaseService) {}

  async getStatus(userId: number) {
    const docs = await this.db.query(
      `SELECT type, status, admin_note, verified_at FROM kyc_documents WHERE user_id = ?`,
      [userId],
    );
    const host = await this.db.query<any[]>(
      'SELECT kyc_status FROM female_hosts WHERE user_id = ?',
      [userId],
    );
    return { success: true, data: { kyc_status: host[0]?.kyc_status || 'pending', documents: docs } };
  }

  async submit(userId: number, type: string, documentUrl: string) {
    await this.db.query(
      `INSERT INTO kyc_documents (user_id, type, document_url, status)
       VALUES (?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE document_url = ?, status = 'pending'`,
      [userId, type, documentUrl, documentUrl],
    );
    await this.db.query(`UPDATE female_hosts SET kyc_status = 'submitted' WHERE user_id = ?`, [userId]);
    return { success: true, message: 'Document submitted for review' };
  }
}
