import React from "react";
import { ComposeSheet } from "./components/ComposeSheet";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "./contexts/I18nContext";
import { Button } from "./components/ui/button";

const queryClient = new QueryClient();

export function ComposeTest() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <div className="p-8">
          <h1 className="text-2xl font-bold mb-4">
            Compose Functionality Test
          </h1>

          <Button onClick={() => setIsOpen(true)}>Open Compose</Button>

          <ComposeSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />

          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-2">Test Checklist:</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>✅ Compose dialog opens</li>
              <li>📧 Email address input works</li>
              <li>📎 Attachment button is present</li>
              <li>📤 Send button is functional</li>
              <li>💾 Draft auto-save works</li>
              <li>🎨 Rich text formatting</li>
              <li>📋 CC/BCC fields</li>
              <li>⚡ Priority settings</li>
            </ul>
          </div>
        </div>
      </I18nProvider>
    </QueryClientProvider>
  );
}
