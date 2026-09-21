import { createIndexedDbDatabase } from './indexed-db'
export const createSqliteDatabase = async (name='walnut-ledger-native') => createIndexedDbDatabase(name)
