import { StyleProp, ViewStyle } from 'react-native';
import {
  Play, X, Sparkles, Tags, Tag, SquarePen, Zap, Dumbbell, UtensilsCrossed,
  List, ListChecks, Footprints, Info, ExternalLink, Trash2, Check,
  CircleAlert, CloudDownload, Link2, FileText, Hourglass, Clock, House,
  ArrowRight, Minus, Plus, Activity, Repeat, Lock, RefreshCw, Circle,
  ChefHat, Cpu, Flame, GraduationCap, Clapperboard, Shirt, Plane, Briefcase,
  Newspaper, HeartPulse, Wallet, Globe, ShoppingCart, CookingPot, Soup, Timer,
  BookOpen, Code, PenLine, Search, Phone, Target, Brain, Wrench, Palette, Leaf,
  PartyPopper, Eye, EyeOff, Scissors, Mail, KeyRound,
  Menu, UserRound, Settings, Bell, Download, LogIn, ChevronRight, Bookmark, Layers, Shield,
  MessageCircle, Compass, ArrowLeft, Send,
} from 'lucide-react-native';

// One icon family for the whole app (Lucide). Platform brand logos are the only
// exception — they stay on Ionicons because Lucide has no brand glyphs.
const MAP: Record<string, any> = {
  // ── UI ──
  play: Play, close: X, sparkles: Sparkles, pricetags: Tags, create: SquarePen,
  flash: Zap, list: List, checkbox: ListChecks, footsteps: Footprints,
  'information-circle': Info, 'open-outline': ExternalLink, 'trash-outline': Trash2,
  checkmark: Check, 'alert-circle': CircleAlert, 'cloud-download': CloudDownload,
  link: Link2, 'document-text': FileText, hourglass: Hourglass, time: Clock,
  'time-outline': Clock, home: House, 'arrow-forward': ArrowRight, remove: Minus,
  add: Plus, repeat: Repeat, 'lock-closed': Lock, refresh: RefreshCw,
  restaurant: UtensilsCrossed, lock: Lock, eye: Eye, 'eye-off': EyeOff,
  mail: Mail, key: KeyRound, celebrate: PartyPopper,
  menu: Menu, user: UserRound, settings: Settings, bell: Bell, download: Download,
  login: LogIn, 'chevron-right': ChevronRight, bookmark: Bookmark, layers: Layers, shield: Shield,
  ask: MessageCircle, rediscover: Compass, back: ArrowLeft, send: Send,

  // ── Categories ──
  fitness: Dumbbell, cooking: ChefHat, tech: Cpu, motivation: Flame,
  education: GraduationCap, entertainment: Clapperboard, fashion: Shirt,
  travel: Plane, business: Briefcase, news: Newspaper, health: HeartPulse,
  finance: Wallet, general: Sparkles, other: Tag, all: Globe,

  // ── Workout muscles / types ──
  strength: Dumbbell, cardio: HeartPulse, flexibility: Activity, fitness_repeat: Repeat,

  // ── Recipe / task step semantics ──
  gather: ShoppingCart, prep: Scissors, mix: CookingPot, cook: Flame, wait: Timer,
  season: Soup, serve: UtensilsCrossed, read: BookOpen, code: Code, write: PenLine,
  research: Search, money: Wallet, call: Phone, goal: Target, schedule: Clock,
  learn: Brain, build: Wrench, creative: Palette, exercise: Dumbbell, mindful: Leaf,
  analyze: Activity, shop: ShoppingCart,
};

// Maps the emoji characters our AI / data produce to the semantic icon keys above,
// so stored emojis render as matching line icons with no data migration.
const EMOJI: Record<string, string> = {
  '💪': 'exercise', '🍳': 'cooking', '💻': 'code', '🔥': 'cook', '📚': 'read',
  '🎬': 'entertainment', '👗': 'fashion', '✈️': 'travel', '💼': 'business',
  '📰': 'news', '🩺': 'health', '💰': 'money', '✨': 'sparkles', '✅': 'checkmark',
  '🛒': 'gather', '🔪': 'prep', '🥣': 'mix', '⏲️': 'wait', '🧂': 'season',
  '🍽️': 'serve', '📝': 'write', '🔍': 'research', '📞': 'call', '🎯': 'goal',
  '⏰': 'schedule', '🧠': 'learn', '🔧': 'build', '🎨': 'creative', '🧘': 'mindful',
  '📊': 'analyze', '🎉': 'celebrate', '🔒': 'lock', '👁️': 'eye', '🏋️': 'exercise',
};

function resolve(name: string): any {
  if (MAP[name]) return MAP[name];
  const stripped = (name || '').replace(/️/g, ''); // drop emoji variation selector
  const key = EMOJI[name] || EMOJI[stripped];
  return (key && MAP[key]) || Circle;
}

interface Props {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}

export function Icon({ name, size = 18, color = '#FFF', strokeWidth = 2, style }: Props) {
  const C = resolve(name);
  return <C size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
