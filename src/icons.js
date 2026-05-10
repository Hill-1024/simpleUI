import {
  Activity,
  Ban,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CloudLightning,
  Cpu,
  Eraser,
  ExternalLink,
  Gauge,
  HardDrive,
  Info,
  Loader2,
  Network,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCw,
  Save,
  Search,
  SearchCheck,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  Wifi,
  X
} from "lucide-vue-next";

const icons = {
  Activity,
  Ban,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CloudLightning,
  Cpu,
  Eraser,
  ExternalLink,
  Gauge,
  HardDrive,
  Info,
  Loader2,
  Network,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCw,
  Save,
  Search,
  SearchCheck,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  Wifi,
  X
};

export function registerIcons(app) {
  for (const [name, component] of Object.entries(icons)) {
    app.component(name, component);
  }
}
