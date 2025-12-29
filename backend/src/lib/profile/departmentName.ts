import { DepartmentCode } from '../../../generated/prisma/client';

// Function to get department name from code
export function getDepartmentName(code: DepartmentCode): string {
  const departmentNames: Record<DepartmentCode, string> = {
    [DepartmentCode.COE]: 'College of Engineering',
    [DepartmentCode.CCS]: 'College of Computer Studies',
    [DepartmentCode.CSM]: 'College of Science and Mathematics',
    [DepartmentCode.CED]: 'College of Education',
    [DepartmentCode.CASS]: 'College of Arts and Social Sciences',
    [DepartmentCode.CEBA]: 'College of Economics and Business Administration',
    [DepartmentCode.CHS]: 'College of Health Sciences',
  };
  
  return departmentNames[code] || 'Unknown Department';
}