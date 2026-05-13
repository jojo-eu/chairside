import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type MvpPlaceholderPageProps = {
  title: string;
};

export const MvpPlaceholderPage = ({ title }: MvpPlaceholderPageProps) => (
  <div className="max-w-3xl mx-auto my-8">
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Táto sekcia je súčasťou Chairside MVP, ale ešte nie je implementovaná.
        </p>
        <p>
          Zatiaľ ide iba o bezpečný zástupný pohľad bez dát, business logiky
          alebo integrácií.
        </p>
      </CardContent>
    </Card>
  </div>
);
