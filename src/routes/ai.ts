import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { suggestProjectPhases, generateProjectDescription } from '../controllers/aiController';

const router = Router();

router.use(authenticate);

router.post('/generate-description', generateProjectDescription);
router.post('/suggest-phases', suggestProjectPhases);

router.post('/match-freelancer', async (req, res) => {
  try {
    const { projectDescription, skills, budget, deadline } = req.body;
    
    const matchingCriteria = {
      skills: skills || [],
      budgetRange: budget || 'unknown',
      timeframe: deadline || 'flexible',
      projectType: projectDescription?.toLowerCase().includes('web') ? 'web_development' : 'general'
    };
    
    const suggestions = [
      {
        reason: 'Best overall match based on project requirements',
        score: 95,
        recommendation: 'Highly recommended for this type of project'
      },
      {
        reason: 'Strong technical skills match',
        score: 87,
        recommendation: 'Good technical fit with relevant experience'
      },
      {
        reason: 'Budget and timeline alignment',
        score: 78,
        recommendation: 'Suitable for budget-conscious projects'
      }
    ];
    
    res.json({
      success: true,
      data: {
        criteria: matchingCriteria,
        suggestions,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error matching freelancer' });
  }
});

router.post('/estimate-time', async (req, res) => {
  try {
    const { projectDescription, scope, complexity } = req.body;
    
    const baseHours = 40;
    let multiplier = 1;
    
    if (complexity === 'simple') multiplier = 0.7;
    else if (complexity === 'complex') multiplier = 1.5;
    else if (complexity === 'very_complex') multiplier = 2.0;
    
    const scopeKeywords = ['database', 'api', 'authentication', 'payment', 'mobile', 'responsive'];
    const foundKeywords = scopeKeywords.filter(keyword => 
      projectDescription?.toLowerCase().includes(keyword) || 
      scope?.toLowerCase().includes(keyword)
    );
    
    const scopeMultiplier = 1 + (foundKeywords.length * 0.2);
    const estimatedHours = Math.round(baseHours * multiplier * scopeMultiplier);
    
    const estimate = {
      estimatedHours,
      breakdown: {
        baseHours,
        complexityMultiplier: multiplier,
        scopeMultiplier: scopeMultiplier,
        foundFeatures: foundKeywords
      },
      ranges: {
        optimistic: Math.round(estimatedHours * 0.8),
        realistic: estimatedHours,
        pessimistic: Math.round(estimatedHours * 1.3)
      },
      phases: [
        { name: 'Planning & Analysis', hours: Math.round(estimatedHours * 0.15) },
        { name: 'Development', hours: Math.round(estimatedHours * 0.65) },
        { name: 'Testing & QA', hours: Math.round(estimatedHours * 0.15) },
        { name: 'Deployment & Documentation', hours: Math.round(estimatedHours * 0.05) }
      ]
    };
    
    res.json({
      success: true,
      data: estimate
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error estimating time' });
  }
});

export default router;