export type Board = {
  id: string;
  name: string;
  initial: string;
  description: string;
};

export const BOARDS: Board[] = [
  { id: "announcements", name: "Announcements", initial: "A", description: "News from the kaluwo team" },
  { id: "general", name: "General", initial: "G", description: "General discussion" },
  { id: "technology", name: "Technology", initial: "T", description: "Tech talk and support" },
  { id: "life-sri-lanka", name: "Life in Sri Lanka", initial: "L", description: "Daily life, news, and events" },
  { id: "food", name: "Food", initial: "F", description: "Recipes, restaurants, and food culture" },
  { id: "travel", name: "Travel", initial: "T", description: "Travel tips and destinations" },
  { id: "sports", name: "Sports", initial: "S", description: "Cricket, rugby, and more" },
];