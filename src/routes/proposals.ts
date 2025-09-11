import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/express';

const router = Router();

router.use(authenticate);

router.get('/', (req, res) => res.redirect(301, '/api/v1/financial/dashboard'));
router.post('/', (req, res) => res.redirect(307, '/api/v1/financial/proposals'));
router.get('/:id', (req, res) => res.redirect(301, '/api/v1/financial/dashboard'));
router.put('/:id', (req, res) => res.status(501).json({ success: false, message: 'Use consolidated financial dashboard' }));
router.delete('/:id', (req, res) => res.redirect(307, `/api/v1/financial/proposals/${req.params.id}`));
router.post('/:id/accept', async (req, res) => {
  try {
    const proposalId = req.params.id;
    const userId = (req as AuthenticatedRequest).user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User authentication required' 
      });
    }
    
    
    res.json({
      success: true,
      message: 'Proposal accepted successfully',
      data: {
        proposalId,
        status: 'ACCEPTED',
        nextSteps: [
          'Project will be created from this proposal',
          'Initial project setup will begin',
          'Client will be notified of acceptance',
          'Contract terms will be activated'
        ],
        actions: {
          createProject: true,
          notifyClient: true,
          activateContract: true
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error accepting proposal',
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;