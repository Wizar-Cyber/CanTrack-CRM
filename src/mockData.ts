import { Job, Company, Candidate, Application } from './types';

export const MOCK_COMPANIES: Company[] = [
  {
    id: 'c1',
    name: 'Shopify',
    location: 'Ottawa, ON',
    size: '10,000+',
    industry: 'E-commerce',
    website: 'https://shopify.com',
    description: 'A leading global commerce company.'
  },
  {
    id: 'c2',
    name: 'Royal Bank of Canada (RBC)',
    location: 'Toronto, ON',
    size: '80,000+',
    industry: 'Banking',
    website: 'https://rbc.com',
    description: 'One of Canada\'s largest banks.'
  }
];

export const MOCK_CANDIDATES: Candidate[] = [
  {
    id: 'can1',
    name: 'Alice Johnson',
    role: 'Frontend Developer',
    email: 'alice@example.com',
    phone: '+1 (613) 555-0123',
    location: 'Ottawa, ON',
    linkedinUrl: 'https://linkedin.com/in/alicejohnson',
    resumeUrl: 'https://example.com/resumes/alice.pdf',
    yearsOfExperience: 5,
    skills: ['React', 'TypeScript', 'Tailwind'],
    status: 'Interviewing',
    bio: 'Experienced frontend engineer with a focus on React and modern CSS frameworks.'
  },
  {
    id: 'can2',
    name: 'Bob Smith',
    role: 'Data Scientist',
    email: 'bob@example.com',
    phone: '+1 (416) 555-0199',
    location: 'Toronto, ON',
    linkedinUrl: 'https://linkedin.com/in/bobsmith',
    yearsOfExperience: 3,
    skills: ['Python', 'SQL', 'Machine Learning'],
    status: 'Available',
    bio: 'Data scientist passionate about extracting insights from complex datasets.'
  },
  {
    id: 'can3',
    name: 'Charlie Brown',
    role: 'Product Designer',
    email: 'charlie@example.com',
    phone: '+1 (604) 555-0144',
    location: 'Vancouver, BC',
    linkedinUrl: 'https://linkedin.com/in/charliebrown',
    yearsOfExperience: 7,
    skills: ['Figma', 'UI/UX', 'Prototyping'],
    status: 'Available',
    bio: 'Senior product designer with a track record of building user-centric interfaces.'
  }
];

export const MOCK_JOBS: Job[] = [
  {
    id: '1',
    title: 'Senior Frontend Engineer',
    companyId: 'c1',
    companyName: 'Shopify',
    source: 'linkedin',
    url: 'https://linkedin.com/jobs/1',
    location: 'Remote, Canada',
    category: 'IT',
    isFavorite: true,
    applicationType: 'Easy Apply',
    requiredSkills: ['React', 'TypeScript', 'GraphQL'],
    status: 'Applied',
    appliedDate: '2024-03-15'
  },
  {
    id: '2',
    title: 'Full Stack Developer',
    companyId: 'c2',
    companyName: 'Royal Bank of Canada (RBC)',
    source: 'indeed',
    url: 'https://indeed.com/jobs/2',
    location: 'Toronto, ON',
    category: 'IT',
    isFavorite: false,
    applicationType: 'External',
    requiredSkills: ['Java', 'Spring Boot', 'React'],
    status: 'Saved'
  }
];

export const MOCK_APPLICATIONS: Application[] = [
  {
    id: 'app1',
    jobId: '1',
    candidateId: 'can1',
    status: 'Interview',
    appliedDate: '2024-03-15',
    notes: 'Alice is a great fit for their Hydrogen team.'
  },
  {
    id: 'app2',
    jobId: '2',
    candidateId: 'can2',
    status: 'Applied',
    appliedDate: '2024-03-18',
    notes: 'Bob applied for the data role at RBC.'
  }
];
