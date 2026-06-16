import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class LanguagesService {
  constructor(private db: DatabaseService) {}

  async getAll() {
    const languages = await this.db.query(
      'SELECT id, name, code FROM languages WHERE status = ?',
      [RECORD_STATUS.ACTIVE],
    );
    return { success: true, data: languages };
  }
}
