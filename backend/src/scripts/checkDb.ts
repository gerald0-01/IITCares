// scripts/checkDatabase.ts
import { prisma } from "../lib/prisma"

async function checkDatabase() {
  console.log('🔍 Checking database status...\n');
  
  try {
    // 1. Test connection
    await prisma.$connect();
    console.log('✅ Database connection successful\n');
    
    // 2. Check if tables exist
    console.log('📋 Checking existing tables:');
    
    // For PostgreSQL
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    console.log('Found tables:');
    (tables as any[]).forEach(table => {
      console.log(`  - ${table.table_name}`);
    });
    
    // 3. Check specific models
    console.log('\n📊 Model counts:');
    
    try {
      const userCount = await prisma.user.count();
      console.log(`  Users: ${userCount}`);
    } catch (e) {
      console.log('  Users table: ❌ Not created yet');
    }
    
    try {
      const deptCount = await prisma.department.count();
      console.log(`  Departments: ${deptCount}`);
    } catch (e) {
      console.log('  Departments table: ❌ Not created yet');
    }
    
    try {
      const studentCount = await prisma.studentProfile.count();
      console.log(`  Student Profiles: ${studentCount}`);
    } catch (e) {
      console.log('  StudentProfiles table: ❌ Not created yet');
    }
    
    try {
      const counselorCount = await prisma.counselorProfile.count();
      console.log(`  Counselor Profiles: ${counselorCount}`);
    } catch (e) {
      console.log('  CounselorProfiles table: ❌ Not created yet');
    }
    
  } catch (error: any) {
    console.error('❌ Database error:', error.message);
    
    if (error.code === 'P1001') {
      console.log('\n💡 Database connection failed. Check:');
      console.log('  1. Is PostgreSQL running?');
      console.log('  2. DATABASE_URL in .env is correct');
      console.log('  3. Try: npx prisma db push');
    }
    
    if (error.code === 'P2021') {
      console.log('\n💡 Table does not exist. Run:');
      console.log('  npx prisma migrate dev');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();