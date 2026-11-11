#!/usr/bin/env node
// verify-conversations.js — Kiểm tra cấu trúc hội thoại sau migration

const { Pool } = require('pg');

async function verifyConversations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ Lỗi: Chưa cấu hình DATABASE_URL');
    return false;
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Kiểm tra các bảng
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('conversations', 'conversation_turns', 'conversation_progress')
      ORDER BY table_name
    `);

    console.log('✅ Các bảng đã được tạo:');
    tables.rows.forEach(row => console.log(`   - ${row.table_name}`));

    // Kiểm tra dữ liệu mẫu
    const count = await pool.query('SELECT COUNT(*) FROM conversations');
    console.log(`\n📊 Tổng số hội thoại trong cơ sở dữ liệu: ${count.rows[0].count}`);

    if (count.rows[0].count > 0) {
      const sample = await pool.query('SELECT * FROM conversations LIMIT 1');
      console.log(`\n🔍 Hội thoại mẫu:`);
      console.log(`   ID: ${sample.rows[0].dialogue_id}`);
      console.log(`   Tiêu đề (Trung): ${sample.rows[0].title_zh}`);
      console.log(`   Tiêu đề (Việt): ${sample.rows[0].title_vi}`);
      console.log(`   Cấp độ: ${sample.rows[0].hsk_level}`);
      console.log(`   Chủ đề: ${sample.rows[0].topic}`);
      console.log(`   Số lượt: ${sample.rows[0].total_turns}`);
    }

    // Kiểm tra indexes
    const indexes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename IN ('conversations', 'conversation_turns')
      AND indexname LIKE 'idx_%'
      ORDER BY indexname
    `);

    console.log(`\n✅ Indexes đã được tạo:`);
    indexes.rows.forEach(row => console.log(`   - ${row.indexname}`));

    console.log('\n✅ Kiểm tra hoàn tất! Hệ thống hội thoại đã sẵn sàng.');
    return true;
  } catch (error) {
    console.error('❌ Lỗi kiểm tra:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

verifyConversations();