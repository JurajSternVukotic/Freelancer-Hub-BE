import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TimerService, CreateTimerData } from '../services/timerService';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/express';
import { uuidSchema } from '../utils/validation';

const startTimerSchema = z.object({
  taskId: uuidSchema,
  description: z.string().optional()
});

export const startTimer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = startTimerSchema.parse(req.body);
    const userId = req.user!.id;

    const timerSession = await TimerService.startTimer(userId, validatedData);

    const response: ApiResponse = {
      success: true,
      message: 'Timer started successfully',
      data: timerSession
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const stopTimer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;

    const stoppedTimer = await TimerService.stopTimer(userId);

    const response: ApiResponse = {
      success: true,
      message: 'Timer stopped successfully',
      data: {
        id: stoppedTimer.id,
        taskId: stoppedTimer.taskId,
        startTime: stoppedTimer.startTime,
        endTime: stoppedTimer.endTime,
        duration: stoppedTimer.duration,
        description: stoppedTimer.description,
        task: stoppedTimer.task
      }
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getCurrentTimer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;

    const currentTimer = await TimerService.getCurrentTimer(userId);

    if (!currentTimer) {
      const response: ApiResponse = {
        success: true,
        message: 'No active timer found',
        data: null
      };
      res.status(200).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: currentTimer
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};