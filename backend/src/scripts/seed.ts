// scripts/seedDepartments.ts
import {prisma} from "../lib/prisma.js"
import { DepartmentCode } from '../../generated/prisma/client.js';

async function seedDepartments() {
  const departments = [
    { 
      code: DepartmentCode.COE, 
      name: 'College of Engineering',
      description: 'Engineering programs and departments' 
    },
    { 
      code: DepartmentCode.CCS, 
      name: 'College of Computer Studies',
      description: 'Computer science and IT programs' 
    },
    { 
      code: DepartmentCode.CSM, 
      name: 'College of Science and Mathematics',
      description: 'Science and mathematics programs' 
    },
    { 
      code: DepartmentCode.CED, 
      name: 'College of Education',
      description: 'Teacher education programs' 
    },
    { 
      code: DepartmentCode.CASS, 
      name: 'College of Arts and Social Sciences',
      description: 'Arts, humanities, and social sciences' 
    },
    { 
      code: DepartmentCode.CEBA, 
      name: 'College of Economics and Business Administration',
      description: 'Business and economics programs' 
    },
    { 
      code: DepartmentCode.CHS, 
      name: 'College of Health Sciences',
      description: 'Health and medical programs' 
    },
  ];

  console.log('Seeding departments...');
  
  for (const dept of departments) {
    try {
      await prisma.department.upsert({
        where: { code: dept.code },
        update: dept,
        create: dept
      });
      console.log(`✓ Department: ${dept.code} - ${dept.name}`);
    } catch (error) {
      console.error(`✗ Failed to seed ${dept.code}:`, error);
    }
  }
  
  // Get all with their IDs
  const allDepts = await prisma.department.findMany({
    orderBy: { code: 'asc' }
  });
  
  console.log('\nAll departments (with IDs):');
  console.table(allDepts.map(d => ({ 
    id: d.id, 
    code: d.code, 
    name: d.name 
  })));
}

seedDepartments()
  .catch(console.error)
  .finally(() => prisma.$disconnect());