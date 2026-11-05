import {
  Cpu,
  Megaphone,
  MessagesSquare,
  Plane,
  Sun,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export type Board = {
  id: string;
  name: string;
  initial: string;
  description: string;
  icon: LucideIcon;
};

export const BOARDS: Board[] = [
  {
    id: "announcements",
    name: "Announcements",
    initial: "A",
    description: "News from the kaluwo team",
    icon: Megaphone,
  },
  {
    id: "general",
    name: "General",
    initial: "G",
    description: "General discussion",
    icon: MessagesSquare,
  },
  {
    id: "technology",
    name: "Technology",
    initial: "T",
    description: "Tech talk and support",
    icon: Cpu,
  },
  {
    id: "life-sri-lanka",
    name: "Life in Sri Lanka",
    initial: "L",
    description: "Daily life, news, and events",
    icon: Sun,
  },
  {
    id: "food",
    name: "Food",
    initial: "F",
    description: "Recipes, restaurants, and food culture",
    icon: UtensilsCrossed,
  },
  {
    id: "travel",
    name: "Travel",
    initial: "T",
    description: "Travel tips and destinations",
    icon: Plane,
  },
  {
    id: "sports",
    name: "Sports",
    initial: "S",
    description: "Cricket, rugby, and more",
    icon: Trophy,
  },
];
