import fetch from 'node-fetch';

export interface ProjectDescriptionRequest {
  userPrompt: string;
  projectTitle?: string;
  budgetRange?: string;
  priority?: string;
  deadline?: string;
}

export interface ProjectDescriptionResponse {
  description: string;
  success: boolean;
  error?: string;
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `Ti si ekspert za planiranje projekata i business analizu. Tvoja uloga je pomoći klijentima kreirati detaljne i profesionalne opise projekata koji će freelancerima dati jasnu sliku o tome što treba biti napravljeno.

Kada korisnik opisuje svoj projekt, generiraj sveobuhvatan opis koji uključuje:

1. **Svrha i ciljevi projekta** - Što klijent želi postići
2. **Tehnički zahtjevi** - Koje tehnologije, platforme ili alati su potrebni
3. **Funkcionalnosti** - Detaljnu listu glavnih funkcionalnosti
4. **Ciljana publika** - Tko će koristiti konačni produkt/uslugu
5. **Dizajn i UX zahtjevi** - Vizualni i korisнički zahtjevi
6. **Integracije** - Potrebne integracije s vanjskim sustavima
7. **Održavanje** - Dugoročni zahtjevi za održavanje i podršku
8. **Mjerila uspjeha** - Kako će se mjeriti uspjeh projekta

Pišи na hrvatskom jeziku, budi koncizan ali detaljan. Tvoj odgovor treba biti profesionalan i strukturiran, tako da freelancer može točno razumjeti opseg posla.

Ako korisnik nije dao dovoljno informacija, postavi mu relevantna pitanja koja će pomoći u stvaranju boljeg opisa.`;

export class ProjectService {
  static async generateProjectDescription(request: ProjectDescriptionRequest): Promise<ProjectDescriptionResponse> {
    if (!OPENROUTER_API_KEY) {
      return {
        success: false,
        description: '',
        error: 'OpenRouter API key is not configured'
      };
    }

    try {
      let contextInfo = '';
      if (request.projectTitle) {
        contextInfo += `Naslov projekta: ${request.projectTitle}\n`;
      }
      if (request.budgetRange) {
        contextInfo += `Proračun: ${request.budgetRange}\n`;
      }
      if (request.priority) {
        contextInfo += `Prioritet: ${request.priority}\n`;
      }
      if (request.deadline) {
        contextInfo += `Željeni rok: ${request.deadline}\n`;
      }

      const userMessage = contextInfo + '\n' + request.userPrompt;

      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://freelancer-hub.com',
          'X-Title': 'FreelancerHub Project Assistant',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
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
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('OpenRouter API error:', response.status, errorData);
        
        return {
          success: false,
          description: '',
          error: `API request failed with status ${response.status}`
        };
      }

      const data: any = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        return {
          success: false,
          description: '',
          error: 'Invalid response format from service'
        };
      }

      const generatedDescription = data.choices[0].message.content.trim();

      return {
        success: true,
        description: generatedDescription,
      };

    } catch (error) {
      console.error('Project Service error:', error);
      return {
        success: false,
        description: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}