import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/express';

const router = Router();

router.use(authenticate);

router.get('/', (req, res) => res.redirect(301, '/api/v1/financial/dashboard'));
router.post('/', (req, res) => res.redirect(307, '/api/v1/financial/retainers'));
router.get('/:id', (req, res) => res.redirect(301, '/api/v1/financial/dashboard'));
router.put('/:id', (req, res) => res.status(501).json({ success: false, message: 'Use consolidated financial dashboard' }));
router.delete('/:id', (req, res) => res.redirect(307, `/api/v1/financial/retainers/${req.params.id}`));
router.get('/:id/usage', async (req, res) => {
  try {
    const retainerId = req.params.id;
    const userId = (req as AuthenticatedRequest).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User authentication required' 
      });
    }
    
    const mockUsage = {
      retainerId,
      totalHours: 40,
      usedHours: 23.5,
      remainingHours: 16.5,
      usagePercentage: 59,
      period: {
        start: '2025-09-01',
        end: '2025-09-30',
        daysRemaining: 20
      },
      recentActivity: [
        {
          date: '2025-09-09',
          hours: 4.5,
          description: 'Website maintenance and updates',
          project: 'Client Website'
        },
        {
          date: '2025-09-08',
          hours: 3.0,
          description: 'Bug fixes and testing',
          project: 'E-commerce Platform'
        },
        {
          date: '2025-09-06',
          hours: 2.5,
          description: 'Database optimization',
          project: 'Backend Services'
        }
      ],
      monthlyBreakdown: [
        { month: 'August', used: 38, allocated: 40 },
        { month: 'July', used: 42, allocated: 40 },
        { month: 'June', used: 35, allocated: 40 }
      ],
      alerts: {
        lowHours: 16.5 < 10,
        overuse: false,
        expiringSoon: 20 < 7
      }
    };
    
    res.json({
      success: true,
      data: mockUsage
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving retainer usage',
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;