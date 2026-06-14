import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class LanguagesService {
  constructor(private db: DatabaseService) {}

  async getAll() {
    const languages = await this.db.query(
      'SELECT id, name, code FROM languages WHERE is_active = 1',
    );
    return { success: true, data: languages };
  }
}
