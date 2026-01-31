package service

import (
	"context"
	"time"

	"calendar-service/repository"

	"go.uber.org/zap"
)

type ReminderWorker struct {
	reminderRepo *repository.ReminderRepository
	notification *NotificationService
	logger       *zap.Logger
	interval     time.Duration
	stopChan     chan struct{}
}

func NewReminderWorker(
	reminderRepo *repository.ReminderRepository,
	notification *NotificationService,
	logger *zap.Logger,
) *ReminderWorker {
	return &ReminderWorker{
		reminderRepo: reminderRepo,
		notification: notification,
		logger:       logger,
		interval:     1 * time.Minute,
		stopChan:     make(chan struct{}),
	}
}

// Start begins the reminder processing loop
func (w *ReminderWorker) Start() {
	w.logger.Info("Starting reminder worker")

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	// Run immediately
	w.processReminders()

	for {
		select {
		case <-ticker.C:
			w.processReminders()
		case <-w.stopChan:
			w.logger.Info("Reminder worker stopped")
			return
		}
	}
}

// Stop stops the reminder worker
func (w *ReminderWorker) Stop() {
	close(w.stopChan)
}

// processReminders processes pending reminders
func (w *ReminderWorker) processReminders() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get reminders due in the next 5 minutes
	reminders, err := w.reminderRepo.GetPendingReminders(ctx, 5)
	if err != nil {
		w.logger.Error("Failed to get pending reminders", zap.Error(err))
		return
	}

	if len(reminders) == 0 {
		return
	}

	w.logger.Info("Processing reminders", zap.Int("count", len(reminders)))

	for _, r := range reminders {
		// Send based on method
		var err error
		switch r.Method {
		case "email":
			err = w.notification.SendReminder(ctx, r)
		case "display":
			// Display notifications would go through push/websocket
			// For now, just log
			w.logger.Info("Display reminder triggered",
				zap.String("event_id", r.EventID.String()),
				zap.String("title", r.Title))
		}

		if err != nil {
			w.logger.Error("Failed to send reminder",
				zap.String("reminder_id", r.ReminderID.String()),
				zap.Error(err))
			continue
		}

		// Mark as triggered
		if err := w.reminderRepo.MarkTriggered(ctx, r.ReminderID); err != nil {
			w.logger.Error("Failed to mark reminder as triggered",
				zap.String("reminder_id", r.ReminderID.String()),
				zap.Error(err))
		}
	}
}
