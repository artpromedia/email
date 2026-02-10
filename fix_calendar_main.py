#!/usr/bin/env python3
"""Fix main.go and config.go to match actual function signatures and method names."""
import os

def fix_config():
    path = '/opt/oonrumail/app/services/calendar/config/config.go'
    with open(path, 'r') as f:
        content = f.read()

    bt = chr(96)  # backtick

    # Add Domain and AuthServiceURL to ServerConfig
    content = content.replace(
        f'PublicURL      string   {bt}yaml:"publicURL"{bt}',
        f'PublicURL       string   {bt}yaml:"publicURL"{bt}\n'
        f'\tDomain         string   {bt}yaml:"domain"{bt}\n'
        f'\tAuthServiceURL string   {bt}yaml:"authServiceURL"{bt}'
    )

    # Add defaults for Domain and AuthServiceURL
    content = content.replace(
        '\tif cfg.Notification.ReminderLookAhead == 0 {',
        '\tif cfg.Server.Domain == "" {\n'
        '\t\tcfg.Server.Domain = "localhost"\n'
        '\t}\n'
        '\tif cfg.Server.AuthServiceURL == "" {\n'
        '\t\tcfg.Server.AuthServiceURL = "http://auth:3000"\n'
        '\t}\n'
        '\tif cfg.Notification.ReminderLookAhead == 0 {'
    )

    with open(path, 'w') as f:
        f.write(content)
    print(f"Fixed {path}")

def fix_main():
    path = '/opt/oonrumail/app/services/calendar/main.go'
    with open(path, 'r') as f:
        content = f.read()

    # Fix 1: NewCalendarService needs reminderRepo and notificationService
    content = content.replace(
        '\t// Initialize services\n'
        '\tcalendarService := service.NewCalendarService(calendarRepo, eventRepo, attendeeRepo, logger.Named("calendar-service"))\n'
        '\tnotificationService := service.NewNotificationService(cfg, logger.Named("notification-service"))',

        '\t// Initialize reminder repository\n'
        '\treminderRepo := repository.NewReminderRepository(dbPool)\n\n'
        '\t// Initialize services\n'
        '\tnotificationService := service.NewNotificationService(cfg, logger.Named("notification-service"))\n'
        '\tcalendarService := service.NewCalendarService(calendarRepo, eventRepo, attendeeRepo, reminderRepo, notificationService, logger.Named("calendar-service"))'
    )

    # Fix 2: StartReminderProcessor doesn't exist - remove that call
    content = content.replace(
        '\t// Start reminder processor\n'
        '\tnotificationService.StartReminderProcessor(ctx, eventRepo)\n\n',
        ''
    )

    # Fix 3: handlers.NewEventHandler doesn't exist - remove it
    content = content.replace(
        '\teventHandler := handlers.NewEventHandler(calendarService, logger.Named("event-handler"))\n',
        ''
    )

    # Fix 4: caldav.NewHandler -> caldav.NewCalDAVHandler with domain param
    content = content.replace(
        '\t// Initialize CalDAV handler\n'
        '\tcaldavHandler := caldav.NewHandler(calendarService, logger.Named("caldav"))',
        '\t// Initialize CalDAV handler\n'
        '\tcaldavHandler := caldav.NewCalDAVHandler(calendarService, logger.Named("caldav"), cfg.Server.Domain)'
    )

    # Fix 5: handlers.AuthMiddleware is a type, not a function
    content = content.replace(
        '\t\tr.Use(handlers.AuthMiddleware)',
        '\t\tauthMw := handlers.NewAuthMiddleware(cfg.Server.AuthServiceURL, logger.Named("auth"))\n\t\tr.Use(authMw.Authenticate)'
    )

    # Fix 6: calendarHandler.List -> calendarHandler.ListCalendars
    content = content.replace('calendarHandler.List)', 'calendarHandler.ListCalendars)')

    # Fix 7: calendarHandler.Create -> calendarHandler.CreateCalendar
    content = content.replace('calendarHandler.Create)', 'calendarHandler.CreateCalendar)')

    # Fix 8: calendarHandler.Get -> calendarHandler.GetCalendar
    content = content.replace('calendarHandler.Get)', 'calendarHandler.GetCalendar)')

    # Fix 9: calendarHandler.Update -> calendarHandler.UpdateCalendar
    content = content.replace('calendarHandler.Update)', 'calendarHandler.UpdateCalendar)')

    # Fix 10: calendarHandler.Delete -> calendarHandler.DeleteCalendar
    content = content.replace('calendarHandler.Delete)', 'calendarHandler.DeleteCalendar)')

    # Fix 11: calendarHandler.Share -> calendarHandler.ShareCalendar
    content = content.replace('calendarHandler.Share)', 'calendarHandler.ShareCalendar)')

    # Fix 12: calendarHandler.Unshare -> calendarHandler.UnshareCalendar
    content = content.replace('calendarHandler.Unshare)', 'calendarHandler.UnshareCalendar)')

    # Fix 13: eventHandler.* -> calendarHandler.* with correct method names
    content = content.replace('eventHandler.List)', 'calendarHandler.ListEvents)')
    content = content.replace('eventHandler.Create)', 'calendarHandler.CreateEvent)')
    content = content.replace('eventHandler.Get)', 'calendarHandler.GetEvent)')
    content = content.replace('eventHandler.Update)', 'calendarHandler.UpdateEvent)')
    content = content.replace('eventHandler.Delete)', 'calendarHandler.DeleteEvent)')
    content = content.replace('eventHandler.Respond)', 'calendarHandler.RespondToEvent)')
    content = content.replace('eventHandler.Search)', 'calendarHandler.SearchEvents)')
    content = content.replace('eventHandler.FreeBusy)', 'calendarHandler.GetFreeBusy)')

    # Fix 14: CalDAV route - caldavHandler has no AuthMiddleware or ServeHTTP
    # Replace the whole CalDAV route block with RegisterRoutes
    content = content.replace(
        '\t// CalDAV endpoints (RFC 4791)\n'
        '\tr.Route("/caldav", func(r chi.Router) {\n'
        '\t\tr.Use(caldavHandler.AuthMiddleware)\n'
        '\t\tr.HandleFunc("/*", caldavHandler.ServeHTTP)\n'
        '\t})',
        '\t// CalDAV endpoints (RFC 4791)\n'
        '\tr.Route("/caldav", func(r chi.Router) {\n'
        '\t\tcaldavHandler.RegisterRoutes(r)\n'
        '\t})'
    )

    with open(path, 'w') as f:
        f.write(content)
    print(f"Fixed {path}")


if __name__ == '__main__':
    fix_config()
    fix_main()
    print("Done!")
