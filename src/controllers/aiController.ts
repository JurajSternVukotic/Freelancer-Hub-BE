import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/express';

const generateDescriptionSchema = z.object({
  userPrompt: z.string().min(10, { message: 'User prompt must be at least 10 characters' }),
  projectTitle: z.string().optional(),
  budgetRange: z.string().optional(),
  priority: z.string().optional(),
  deadline: z.string().optional(),
});

const suggestPhasesSchema = z.object({
  projectDescription: z.string().min(10, { message: 'Project description must be at least 10 characters' }),
  projectType: z.string().optional(),
  budget: z.number().optional(),
  timeline: z.string().optional()
});

export interface ProjectPhase {
  name: string;
  duration: string;
  deliverables: string[];
  description?: string;
}

export interface ProjectPhaseSuggestion {
  phases: ProjectPhase[];
  estimatedDuration: string;
  recommendations: string[];
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `Ti si ekspert za planiranje projekata i business analizu. Tvoja uloga je generirati kratak i profesionalan opis projekta na temelju korisnikove kratke ideje.

VAŽNO: Nikad ne pitaj korisnika za dodatne informacije. Uvijek generiraj kompletan opis projekta na temelju onoga što ti korisnik kaže.

Na temelju korisnikove ideje, generiraj strukturiran opis projekta koji uključuje:

## Opis Projekta

**Svrha i ciljevi:**
[Opiši što projekt želi postići]

**Tehnički zahtjevi:**
[Predloži potrebne tehnologije i platforme]

**Glavne funkcionalnosti:**
• [Lista ključnih funkcionalnosti]
• [Dodatne funkcionalnosti]

**Ciljana publika:**
[Opiši tko će koristiti proizvod/uslugu]

**Dizajn i UX:**
[Predloži vizualne i korisničke zahtjeve]

**Potrebne integracije:**
[Navedi moguće integracije s vanjskim sustavima]

**Održavanje i podrška:**
[Opiši dugoročne zahtjeve]

VEOMA VAŽNO: MORAŠ ISKORISTITI 650 RIJEČI ILI MANJE

Pišи na hrvatskom jeziku, budi koncizan ali detaljan. Koristi informacije koje imaš da napraviš najbolji mogući opis projekta. Keep`;

/**
 * Service for project phase suggestions and description generation
 */
class DescriptionService {
  private static openrouter_key: string = OPENROUTER_API_KEY || '';

  static initialize() {
    console.log('Description Service initialized with OpenRouter');
  }

  /**
   * Generate project description using OpenRouter API
   */
  static async generateProjectDescription(
    userPrompt: string,
    projectTitle?: string,
    budgetRange?: string,
    priority?: string,
    deadline?: string
  ): Promise<{ success: boolean; description?: string; error?: string }> {
    if (!this.openrouter_key) {
      return {
        success: false,
        error: 'OpenRouter API key is not configured'
      };
    }

    try {
      let contextInfo = '';
      if (projectTitle) {
        contextInfo += `Naslov projekta: ${projectTitle}\n`;
      }
      if (budgetRange) {
        contextInfo += `Proračun: ${budgetRange}\n`;
      }
      if (priority) {
        contextInfo += `Prioritet: ${priority}\n`;
      }
      if (deadline) {
        contextInfo += `Željeni rok: ${deadline}\n`;
      }

      const userMessage = contextInfo + '\n' + userPrompt;

      const response = await axios.post(OPENROUTER_URL, {
        model: 'deepseek/deepseek-chat-v3.1',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      }, {
        headers: {
          'Authorization': `Bearer ${this.openrouter_key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://freelancer-hub.com',
          'X-Title': 'FreelancerHub Project Assistant',
        }
      });

      const data = response.data;
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        return {
          success: false,
          error: 'Invalid response format from service'
        };
      }

      const generatedDescription = data.choices[0].message.content.trim();

      return {
        success: true,
        description: generatedDescription,
      };

    } catch (error: any) {
      console.error('Description Service error:', error);
      
      if (error.response) {
        console.error('OpenRouter API error:', error.response.status, error.response.data);
        return {
          success: false,
          error: `API request failed with status ${error.response.status}`
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate project phase suggestions using stub data
   */
  static async suggestProjectPhases(
    projectDescription: string,
    projectType?: string,
    budget?: number,
    timeline?: string
  ): Promise<ProjectPhaseSuggestion> {
    
    return this.getStubSuggestions(projectDescription, projectType);
  }

  /**
   * Get stub suggestions 
   */
  private static getStubSuggestions(
    projectDescription: string,
    projectType?: string
  ): ProjectPhaseSuggestion {
    
    const description = projectDescription.toLowerCase();
    let detectedType = projectType || 'web';
    
    if (description.includes('web') || description.includes('stranica')) {
      detectedType = 'web';
    } else if (description.includes('mobile') || description.includes('app') || description.includes('aplikacija')) {
      detectedType = 'mobile';
    } else if (description.includes('design') || description.includes('dizajn')) {
      detectedType = 'design';
    } else if (description.includes('marketing')) {
      detectedType = 'marketing';
    }

    const phaseTemplates = {
      web: {
        phases: [
          {
            name: 'Planiranje i analiza zahtjeva',
            duration: '1-2 tjedna',
            deliverables: [
              'Dokumentacija zahtjeva',
              'Tehnička specifikacija',
              'Mapa stranice (sitemap)',
              'Korisničke priče'
            ],
            description: 'Definiranje funkcionalnosti, tehnološkog steka i arhitekture'
          },
          {
            name: 'UI/UX dizajn',
            duration: '1-2 tjedna',
            deliverables: [
              'Wireframe mockupi',
              'UI dizajn stranica',
              'Prototip interakcija',
              'Stil vodič'
            ],
            description: 'Kreiranje korisničkog sučelja i korisničkog iskustva'
          },
          {
            name: 'Frontend razvoj',
            duration: '3-4 tjedna',
            deliverables: [
              'Responzivne web stranice',
              'Integracija s API-jem',
              'Optimizirane performanse',
              'Cross-browser kompatibilnost'
            ],
            description: 'Implementacija korisničkog sučelja i funkcionalnosti'
          },
          {
            name: 'Backend razvoj',
            duration: '2-3 tjedna',
            deliverables: [
              'API endpoints',
              'Baza podataka',
              'Autentifikacija',
              'API dokumentacija'
            ],
            description: 'Razvoj serverske logike i baze podataka'
          },
          {
            name: 'Testiranje i deployment',
            duration: '1 tjedan',
            deliverables: [
              'Test izvješća',
              'Produkcijska aplikacija',
              'Backup plan',
              'Korisničke upute'
            ],
            description: 'Finalno testiranje i puštanje u produkciju'
          }
        ],
        estimatedDuration: '8-12 tjedana',
        recommendations: [
          'Koristite Git za verzioniranje koda',
          'Planirajte redovite prezentacije napretka klijentu',
          'Testirajte na više uređaja i preglednika',
          'Dokumentirajte kod za lakše održavanje'
        ]
      },
      mobile: {
        phases: [
          {
            name: 'Koncept i planiranje',
            duration: '1-2 tjedna',
            deliverables: [
              'Aplikacijska specifikacija',
              'Korisničke persone',
              'Funkcijski zahtjevi',
              'Tehnička arhitektura'
            ],
            description: 'Definiranje koncepta aplikacije i tehničkih zahtjeva'
          },
          {
            name: 'UX/UI dizajn aplikacije',
            duration: '2-3 tjedna',
            deliverables: [
              'Wireframe svih ekrana',
              'UI dizajn',
              'Prototip aplikacije',
              'Ikone i grafički elementi'
            ],
            description: 'Kreiranje korisničkog sučelja prilagođenog mobilnim uređajima'
          },
          {
            name: 'Razvoj aplikacije',
            duration: '4-6 tjedana',
            deliverables: [
              'Funkcionalna aplikacija',
              'Integracija s vanjskim servisima',
              'Push notifikacije',
              'Offline funkcionalnost'
            ],
            description: 'Implementacija aplikacije za iOS/Android platforme'
          },
          {
            name: 'Testiranje i objava',
            duration: '1-2 tjedna',
            deliverables: [
              'Beta verzija za testiranje',
              'Ispravke bugova',
              'App Store/Play Store objava',
              'Marketing materijali'
            ],
            description: 'Testiranje aplikacije i objavljivanje u trgovinama'
          }
        ],
        estimatedDuration: '8-13 tjedana',
        recommendations: [
          'Testirajte na stvarnim uređajima',
          'Pridržavajte se smjernica platformi',
          'Planirajte proces objave u trgovinama',
          'Pripremite marketing strategiju za lansiranje'
        ]
      },
      design: {
        phases: [
          {
            name: 'Istraživanje i brief',
            duration: '3-5 dana',
            deliverables: [
              'Kreativni brief',
              'Analiza konkurencije',
              'Mood board',
              'Ciljne skupine'
            ],
            description: 'Razumijevanje projekta i kreiranja kreativne strategije'
          },
          {
            name: 'Konceptualni razvoj',
            duration: '1-2 tjedna',
            deliverables: [
              'Skice i koncepti',
              'Tipografija',
              'Paleta boja',
              'Početni dizajn prijedlozi'
            ],
            description: 'Kreiranje vizualnih koncepata i smjera'
          },
          {
            name: 'Finalizacija dizajna',
            duration: '1-2 tjedna',
            deliverables: [
              'Finalni dizajn',
              'Stil vodič',
              'Svi potrebni formati',
              'Izvorni fajlovi'
            ],
            description: 'Dovršavanje dizajna i priprema za implementaciju'
          },
          {
            name: 'Revizije i predaja',
            duration: '3-5 dana',
            deliverables: [
              'Finalne revizije',
              'Dokumentacija',
              'Predaja fajlova',
              'Presentation deck'
            ],
            description: 'Završne izmjene i predaja projektnih materijala'
          }
        ],
        estimatedDuration: '3-5 tjedana',
        recommendations: [
          'Definirajte broj revizija unaprijed',
          'Koristite verzioniranje za sve fajlove',
          'Pripremite prezentaciju za klijenta',
          'Dokumentirajte sve dizajn odluke'
        ]
      },
      marketing: {
        phases: [
          {
            name: 'Strategija i planiranje',
            duration: '1 tjedan',
            deliverables: [
              'Marketing strategija',
              'Analiza target grupe',
              'Konkurentska analiza',
              'KPI definiranje'
            ],
            description: 'Kreiranje marketing strategije i plana kampanje'
          },
          {
            name: 'Kreiranje sadržaja',
            duration: '2-3 tjedna',
            deliverables: [
              'Tekstualni sadržaj',
              'Vizualni materijali',
              'Video sadržaj',
              'Social media plan'
            ],
            description: 'Proizvodnja marketinških materijala i sadržaja'
          },
          {
            name: 'Implementacija kampanje',
            duration: '2-4 tjedna',
            deliverables: [
              'Pokretanje kampanja',
              'Monitoring performansi',
              'A/B testiranje',
              'Optimizacije'
            ],
            description: 'Pokretanje i upravljanje marketing kampanjama'
          },
          {
            name: 'Analiza i izvješća',
            duration: '1 tjedan',
            deliverables: [
              'Performance izvješće',
              'ROI analiza',
              'Preporuke za buduće kampanje',
              'Finalni report'
            ],
            description: 'Analiza rezultata i kreiranje izvješća o uspješnosti'
          }
        ],
        estimatedDuration: '6-10 tjedana',
        recommendations: [
          'Postavite jasne KPI-je za mjerenje uspjeha',
          'Koristite A/B testiranje za optimizaciju',
          'Pratite konkurenciju tijekom kampanje',
          'Pripremite plan za skaliranje uspješnih kampanja'
        ]
      }
    };

    const template = phaseTemplates[detectedType as keyof typeof phaseTemplates] || phaseTemplates.web;
    
    return {
      ...template,
      recommendations: [
        ...template.recommendations,
        'Dogovorite redovite check-in sastanke s klijentom',
        'Koristite projekt management alate za praćenje napretka'
      ]
    };
  }
}

DescriptionService.initialize();

/**
 * Generate project description based on user prompt
 * POST /generate-description
 */
export const generateProjectDescription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = generateDescriptionSchema.parse(req.body);

    const result = await DescriptionService.generateProjectDescription(
      validatedData.userPrompt,
      validatedData.projectTitle,
      validatedData.budgetRange,
      validatedData.priority,
      validatedData.deadline
    );

    if (!result.success) {
      throw new CustomError(result.error || 'Failed to generate project description', 500);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        description: result.description
      }
    };

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      throw new CustomError(`Validation error: ${errorMessages.join(', ')}`, 400);
    }
    
    next(error);
  }
};

/**
 * Suggest project phases based on description
 * POST /suggest-phases
 */
export const suggestProjectPhases = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = suggestPhasesSchema.parse(req.body);

    const suggestions = await DescriptionService.suggestProjectPhases(
      validatedData.projectDescription,
      validatedData.projectType,
      validatedData.budget,
      validatedData.timeline
    );

    const response: ApiResponse = {
      success: true,
      data: suggestions
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};