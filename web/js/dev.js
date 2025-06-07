export const devData = {
    name: 'Ritik',
    company: 'American Express',
    role: 'Software Engineer',
    focus: 'coding',
    resume: `RITIK
Full Stack Software Engineer
Contact: +91 9991448771 | ritik135001@gmail.com | Portfolio | LinkedIn | GitHub | VitalBite

________________________________________
PROFESSIONAL SUMMARY
Full Stack Developer with 2+ years of experience building scalable web applications and cloud solutions. Proven expertise in JavaScript frameworks (React, Vue, Angular), Python, AWS infrastructure, and AI integration. Track record of delivering high-quality enterprise solutions for clients including Amazon and Innovan. Strong focus on clean code, responsive design, and emerging technologies.

________________________________________
TECHNICAL SKILLS
- Frontend: JavaScript, TypeScript, React, Vue.js, Angular, HTML5, CSS3, Tailwind CSS
- Backend: Node.js, Python, Spring Boot, Java, RESTful APIs
- Cloud & DevOps: AWS (CDK, CloudWatch), Docker, CI/CD, Git
- Databases: PostgreSQL, MongoDB, MySQL, Oracle DB
- AI & Modern Tech: OpenAI/Claude/Gemini APIs, PWAs, AI Agents, Prompt Engineering
- Tools & Methods: Agile, Jira, Confluence, Bitbucket, GitLab, Postman

________________________________________
PROFESSIONAL EXPERIENCE
SOFTWARE ENGINEER | TEKsystems Global Services
September 2022 – Present

Amazon Inc. | AWS Infrastructure Optimization & Code Migration
February 2024 – December 2024

- Streamlined AWS infrastructure using Amazon CDK with TypeScript, improving performance and cost efficiency
- Configured CloudWatch monitoring and alerts, ensuring 99.9% system availability
- Collaborated with cross-functional teams to resolve code migration conflicts and optimize resource management
- Technologies: AWS CDK, TypeScript, CloudWatch, CloudFormation, JAVA

Innovan | Government Benefits & Eligibility Web Application
April 2023 – January 2024

- Developed critical features for a government benefits platform using Vue.js and Spring Boot
- Created reusable Vue components with custom directives, mixins, and scoped slots
- Managed backend infrastructure using Docker, Jenkins, Oracle DB & MongoDB
- Led sprint refinements and client communications; recognized for high-quality delivery
- Recognition: Certificate of Appreciation from Innovan & Spot Award from TEKsystems
- Technologies: Vue.js, Spring Boot, Java, Oracle DB, MongoDB, Docker, Jira

Ruan | Fleet Management Web & Android Application
November 2022 – February 2023

- Enhanced fleet management UI using Angular, improving user experience and functionality
- Conducted API testing with Postman, ensuring reliable front-end/back-end integration
- Collaborated to identify and resolve bugs, contributing to product stability
- Recognition: Spot Award from TEKsystems
- Technologies: Angular, PostgreSQL, Postman, Jira, GitLab

________________________________________
PROJECTS
VitalBite | AI-Powered Nutrition Tracker PWA
January 2025 – February 2025

- Developed an AI-powered calorie tracking webapp & PWA with Google Gemini AI
- Implemented multi-modal inputs (text NLP, image uploads, camera capture) for seamless food logging
- Engineered full offline capabilities using service workers, IndexedDB, & Background Sync API
- Built interactive & responsive UI with React 18, TypeScript, Tailwind CSS, and Recharts
- Live demo: Vitalbite
- Technologies: React, TypeScript, Google Gemini AI, Supabase, PWA, Tailwind CSS

Additional featured projects and can be found on my GitHub

________________________________________
EDUCATION
Bachelor of Technology in Computer Science Engineering
Chandigarh Group of Colleges, India
2018 – 2022

________________________________________
ADDITIONAL SKILLS
- Open Source: Experienced in exploring and leveraging open source tools and libraries
- AI Development: Proficient with Cursor and other AI-assisted development tools
- UI/UX: Strong focus on accessibility standards (WCAG) and responsive design
- Soft Skills: Client communication, Quick learning, Collaborative approach, Risk mitigation
- Languages: English (Fluent), Hindi (Native)`,
    objectives: `About the job
Job Title: AI/ML Development Engineer
Company: Nucleus Institute Corp.
Location: Remote (Full-Time)


Company Overview:

At Nucleus Institute, we are dedicated to driving innovation through the creation of advanced AI agents designed to streamline operations and enhance efficiency across various business domains. Our AI solutions are engineered to think, learn, and adapt, automating complex processes while providing deep analytical insights that inform strategic decision-making.


We are seeking a talented AI/ML Development Engineer to join our team. This role offers an exciting opportunity to work on groundbreaking AI/ML projects, crafting the intelligence systems that power our state-of-the-art AI Assistants.


Key Responsibilities:



AI Assistant Development: Lead the development of AI Assistants using Python, with a strong emphasis on Large Language Models (LLMs) and LangChain technologies.
LangChain Expertise: Utilize LangChain Core, Langgraph, Langserve, and LangSmith for building and deploying AI applications, ensuring robust, stateful, and efficient architectures.
Data Pipeline Construction: Build and optimize data pipelines for training and deploying AI models, with a focus on vector databases for efficient data handling.
Backend & API Integration: Implement and manage backend services using FastAPI, and integrate AI features with cloud-based solutions for scalable deployment.
Frontend Development: Develop responsive and intuitive web and mobile interfaces using TypeScript, React, React-Native, and Next.js, ensuring seamless user experiences.
Model Training & Deployment: Utilize Hugging Face frameworks for training, fine-tuning, and deploying Transformer models, including BERT, GPT, and T5.
Proprietary Model Integration: Work with leading AI models from OpenAI, Anthropic, Google, and Meta, focusing on API integration, fine-tuning, and prompt engineering.
Cloud Platforms: Deploy AI solutions on Google Cloud Platform (GCP), with a strong understanding of services like Cloud Run, Cloud Build, and Firebase, as well as familiarity with AWS alternatives.
Cross-functional Collaboration: Collaborate with cross-functional teams, effectively communicating technical concepts to both technical and non-technical stakeholders.
Agile Methodologies: Participate in Agile development practices to ensure efficient and timely project delivery.


Qualifications:



Programming Mastery: Proficiency in Python with a focus on AI/ML applications, including extensive experience with LLMs and LangChain for conversational agents.
AI Frameworks: Strong knowledge of Hugging Face tools, including Transformers, Tokenizers, Datasets, and the Model Hub for state-of-the-art AI development.
Backend & Frontend Expertise: Skilled in using FastAPI for backend development and TypeScript for managing web and mobile interfaces.
Cloud Proficiency: Extensive experience with GCP services, with knowledge of AWS and Azure cloud platforms for deploying and managing AI-driven applications.
Database Experience: Proficient in using vector databases like Pinecone and graph databases such as Neo4j, alongside NoSQL and SQL databases.
Problem-Solving Skills: Demonstrated ability to analyze complex problems and develop innovative AI/ML solutions.
Educational Background: Bachelor’s or Master’s degree in Computer Science or a related field, or equivalent practical experience.

Why Join Us?



As a key member of our team, you will have the opportunity to shape the future of AI by developing cutting-edge AI Assistants and other AI-driven solutions. If you’re passionate about Python programming, AI/ML development, and cloud technologies, we encourage you to apply and be a part of our journey to redefine digital interaction.


Apply Today:`
};

import { devLog } from './config.js';

export function autofillForTesting(onboardingForm) {
    devLog("Autofilling form for testing...");
    onboardingForm.name.value = devData.name;
    onboardingForm.company.value = devData.company;
    onboardingForm.role.value = devData.role;
    
    onboardingForm.focusCheckboxes.forEach(cb => {
        if (cb.value === devData.focus) {
            cb.checked = true;
        }
    });

    onboardingForm.resume.value = devData.resume;
    onboardingForm.objectives.value = devData.objectives;
}