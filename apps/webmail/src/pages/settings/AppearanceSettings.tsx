import { useState, useEffect } from "react";
import { Palette, Monitor, Sun, Moon, LayoutGrid, Rows } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function AppearanceSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { toast } = useToast();

  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );

  // Load density from localStorage
  useEffect(() => {
    const savedDensity = localStorage.getItem("mail-density") as
      | "comfortable"
      | "compact";
    if (savedDensity) {
      setDensity(savedDensity);
      // Apply density class to document
      document.documentElement.classList.remove(
        "density-comfortable",
        "density-compact",
      );
      document.documentElement.classList.add(`density-${savedDensity}`);
    }
  }, []);

  const themeOptions = [
    {
      value: "light",
      label: "Light",
      icon: Sun,
      description: "Clean and bright interface",
      preview: "bg-white border-gray-200 text-gray-900",
    },
    {
      value: "dark",
      label: "Dark",
      icon: Moon,
      description: "Easy on the eyes in low light",
      preview: "bg-gray-900 border-gray-700 text-white",
    },
    {
      value: "system",
      label: "System",
      icon: Monitor,
      description: "Follow system preference",
      preview:
        "bg-gradient-to-br from-white to-gray-900 border-gray-400 text-gray-700",
    },
  ];

  const densityOptions = [
    {
      value: "comfortable",
      label: "Comfortable",
      icon: LayoutGrid,
      description: "More spacing for easier interaction",
    },
    {
      value: "compact",
      label: "Compact",
      icon: Rows,
      description: "Denser layout for more information",
    },
  ];

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    toast({
      title: "Theme updated",
      description: `Switched to ${newTheme} theme.`,
    });
  };

  const handleDensityChange = (newDensity: "comfortable" | "compact") => {
    setDensity(newDensity);
    localStorage.setItem("mail-density", newDensity);

    // Apply density class immediately
    document.documentElement.classList.remove(
      "density-comfortable",
      "density-compact",
    );
    document.documentElement.classList.add(`density-${newDensity}`);

    toast({
      title: "Density updated",
      description: `Switched to ${newDensity} density.`,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Appearance Settings</h2>
        <p className="text-muted-foreground">
          Customize the look and feel of your mail interface.
        </p>
      </div>

      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Theme
          </CardTitle>
          <CardDescription>
            Choose your preferred color scheme. Current: {resolvedTheme}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <Button
                  key={option.value}
                  variant={theme === option.value ? "default" : "outline"}
                  className="justify-start h-auto p-4 w-full"
                  onClick={() =>
                    handleThemeChange(
                      option.value as "light" | "dark" | "system",
                    )
                  }
                >
                  <div className="flex items-center gap-4 w-full">
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <div className="text-left flex-1">
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                    {/* Theme preview */}
                    <div
                      className={cn(
                        "w-12 h-8 rounded border-2 flex-shrink-0",
                        option.preview,
                      )}
                    />
                  </div>
                </Button>
              );
            })}
          </div>

          {/* Brand Information */}
          <div className="mt-6 p-4 border border-border rounded-lg bg-muted/30">
            <div className="space-y-2">
              <p className="text-sm font-medium">Brand Adaptation</p>
              <p className="text-sm text-muted-foreground">
                CEERION Mail automatically adapts logo and brand elements based
                on your theme choice.
              </p>
              <div className="text-xs space-y-1 mt-2">
                <div>
                  <strong>Current theme:</strong> {theme} (resolved:{" "}
                  {resolvedTheme})
                </div>
                <div>
                  <strong>Logo variant:</strong>{" "}
                  {resolvedTheme === "dark" ? "light" : "dark"}
                </div>
                <div>
                  <strong>Assets path:</strong>{" "}
                  <code className="bg-muted px-1 rounded">/brand/ceerion/</code>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Density Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Density
          </CardTitle>
          <CardDescription>
            Adjust the spacing and layout density of the interface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {densityOptions.map((option) => {
              const Icon = option.icon;
              return (
                <Button
                  key={option.value}
                  variant={density === option.value ? "default" : "outline"}
                  className="justify-start h-auto p-4 w-full"
                  onClick={() =>
                    handleDensityChange(
                      option.value as "comfortable" | "compact",
                    )
                  }
                >
                  <div className="flex items-center gap-4">
                    <Icon className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>

          <div className="mt-4 p-3 border border-border rounded-lg bg-muted/20">
            <p className="text-sm text-muted-foreground">
              Density changes apply immediately across the entire application.
              Compact mode shows more content per screen while comfortable mode
              provides easier interaction.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            See how your appearance settings affect the interface.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="h-4 bg-foreground/20 rounded w-32"></div>
                <div className="h-3 bg-foreground/10 rounded w-48"></div>
              </div>
              <div className="h-6 w-16 bg-primary rounded"></div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-foreground/10 rounded w-full"></div>
              <div className="h-3 bg-foreground/10 rounded w-3/4"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
