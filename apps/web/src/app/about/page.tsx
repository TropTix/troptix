import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const team = [
  {
    name: 'Full Name',
    role: 'Title or Role',
    bio: 'Short bio placeholder about this teammate and their focus.',
  },
  {
    name: 'Full Name',
    role: 'Title or Role',
    bio: 'Short bio placeholder about this teammate and their focus.',
  },
  {
    name: 'Full Name',
    role: 'Title or Role',
    bio: 'Short bio placeholder about this teammate and their focus.',
  },
];

const highlights = [
  {
    title: 'Built for the Caribbean',
    description:
      'We build with local context in mind. How events are promoted, how people buy, how teams work on the ground, and how communities show up.',
  },
  {
    title: 'Reliable by design',
    description:
      'Events move fast and there’s no margin for things breaking at the door. We focus on infrastructure people can trust, from purchase to check-in.',
  },
  {
    title: 'More than generic tools',
    description:
      'We plan for security, accessibility, and real-world constraints so the tools meet people where they are.',
  },
];

export default function AboutPage() {
  return (
    <main className="relative overflow-hidden bg-gradient-to-br from-background via-background/95 to-muted/40">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-chart-2/10 blur-3xl" />
      </div>

      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-16 pt-24 sm:px-6 lg:pt-28">
        <div className="flex flex-col gap-6 text-left">
          <Badge className="w-fit bg-primary/10 text-primary hover:bg-primary/10">
            Our Story
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            The operating system for Caribbean events.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            TropTix is modern infrastructure for events in the Caribbean. We’re
            technologists from Jamaica who grew up around the culture, the
            energy, and the pride that goes into our events. From Carnival to
            conferences to the parties that define a season, the experiences are
            world-class. The technology behind them usually isn’t.
          </p>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            We’re starting with ticketing, but we’re thinking much bigger. Our
            focus is the full suite of tools that support organizers and
            attendees before, during, and after an event, so the entire
            experience feels more intentional and more meaningful.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {highlights.map((highlight) => (
            <div key={highlight.title} className="space-y-2">
              <p className="text-base font-semibold text-foreground">
                {highlight.title}
              </p>
              <p className="text-sm text-muted-foreground">
                {highlight.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="space-y-6">
          <div className="space-y-3">
            <Badge className="w-fit bg-secondary text-secondary-foreground">
              Why We Are Building
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Caribbean events deserve better infrastructure.
            </h2>
          </div>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            Caribbean events consistently deliver some of the best production,
            energy, and culture in the world. What’s missing is technology that
            truly keeps up. Too often, organizers are forced to rely on tools
            that weren’t built for their scale, their audiences, or their
            realities.
          </p>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            As technologists who’ve seen this firsthand, we’re building TropTix
            to give organizers infrastructure they can rely on and attendees
            experiences that feel smooth, modern, and trustworthy. Ticketing is
            just one piece of that puzzle. We’re building toward a broader set
            of tools that support how events are planned, sold, experienced, and
            remembered.
          </p>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="space-y-8">
          <div className="space-y-3">
            <Badge className="w-fit bg-primary/10 text-primary">
              Who We Are
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Meet the people building TropTix.
            </h2>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
              We’re a small team of Jamaican technologists building TropTix
              because we care deeply about the events that shape our culture.
              We’ve been attendees, organizers, and builders. This is us
              applying what we know to something we love.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((member, index) => (
              <Card
                key={`${member.name}-${index}`}
                className="border-border/60 bg-background/80 shadow-sm"
              >
                <CardContent className="flex flex-col items-start gap-4 p-6">
                  <div className="relative">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-chart-2/20">
                      <span className="text-xs font-semibold text-primary">
                        Photo
                      </span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-2 border-background bg-primary/20" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">
                      {member.name}
                    </p>
                    <p className="text-sm text-primary">{member.role}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.bio}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
