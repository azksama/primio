import { forwardRef } from 'react'
import { HugeiconsIcon, type HugeiconsProps, type IconSvgElement } from '@hugeicons/react'
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon'
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon'
import ArrowDown02Icon from '@hugeicons/core-free-icons/ArrowDown02Icon'
import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon'
import ArrowLeft02Icon from '@hugeicons/core-free-icons/ArrowLeft02Icon'
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon'
import ArrowRight02Icon from '@hugeicons/core-free-icons/ArrowRight02Icon'
import ArrowUp02Icon from '@hugeicons/core-free-icons/ArrowUp02Icon'
import Bookmark02Icon from '@hugeicons/core-free-icons/Bookmark02Icon'
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon'
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon'
import CastIcon from '@hugeicons/core-free-icons/CastIcon'
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon'
import Clock01Icon from '@hugeicons/core-free-icons/Clock01Icon'
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon'
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon'
import DiscoverCircleIcon from '@hugeicons/core-free-icons/DiscoverCircleIcon'
import Download04Icon from '@hugeicons/core-free-icons/Download04Icon'
import Edit02Icon from '@hugeicons/core-free-icons/Edit02Icon'
import Film02Icon from '@hugeicons/core-free-icons/Film02Icon'
import FavouriteIcon from '@hugeicons/core-free-icons/FavouriteIcon'
import StarIcon from '@hugeicons/core-free-icons/StarIcon'
import FolderAddIcon from '@hugeicons/core-free-icons/FolderAddIcon'
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon'
import ImageNotFound01Icon from '@hugeicons/core-free-icons/ImageNotFound01Icon'
import InformationCircleIcon from '@hugeicons/core-free-icons/InformationCircleIcon'
import LinkSquare02Icon from '@hugeicons/core-free-icons/LinkSquare02Icon'
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon'
import Mail01Icon from '@hugeicons/core-free-icons/Mail01Icon'
import MinusSignIcon from '@hugeicons/core-free-icons/MinusSignIcon'
import Notification03Icon from '@hugeicons/core-free-icons/Notification03Icon'
import PauseIcon from '@hugeicons/core-free-icons/PauseIcon'
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon'
import PuzzleIcon from '@hugeicons/core-free-icons/PuzzleIcon'
import RefreshIcon from '@hugeicons/core-free-icons/RefreshIcon'
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon'
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon'
import SlidersHorizontalIcon from '@hugeicons/core-free-icons/SlidersHorizontalIcon'
import SparklesIcon from '@hugeicons/core-free-icons/SparklesIcon'
import Square01Icon from '@hugeicons/core-free-icons/Square01Icon'
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon'
import Upload04Icon from '@hugeicons/core-free-icons/Upload04Icon'
import UserIcon from '@hugeicons/core-free-icons/UserIcon'
import ViewIcon from '@hugeicons/core-free-icons/ViewIcon'
import ViewOffSlashIcon from '@hugeicons/core-free-icons/ViewOffSlashIcon'
import WifiDisconnected01Icon from '@hugeicons/core-free-icons/WifiDisconnected01Icon'
import ThumbsDownIcon from '@hugeicons/core-free-icons/ThumbsDownIcon'
import ShuffleIcon from '@hugeicons/core-free-icons/ShuffleIcon'
import Mic02Icon from '@hugeicons/core-free-icons/Mic02Icon'

function icon(data: IconSvgElement) {
  return forwardRef<SVGSVGElement, HugeiconsProps>((props, ref) => (
    <HugeiconsIcon ref={ref} icon={data} size={24} strokeWidth={1.6} aria-hidden="true" {...props} />
  ))
}
export const ArrowDown = icon(ArrowDown02Icon)
export const ArrowLeft = icon(ArrowLeft02Icon)
export const ArrowRight = icon(ArrowRight02Icon)
export const ArrowUp = icon(ArrowUp02Icon)
export const Bell = icon(Notification03Icon)
export const Bookmark = icon(Bookmark02Icon)
export const CalendarDays = icon(Calendar03Icon)
export const Cast = icon(CastIcon)
export const Check = icon(Tick02Icon)
export const CheckCircle2 = icon(CheckmarkCircle02Icon)
export const ChevronDown = icon(ArrowDown01Icon)
export const ChevronLeft = icon(ArrowLeft01Icon)
export const ChevronRight = icon(ArrowRight01Icon)
export const Clapperboard = icon(Film02Icon)
export const Compass = icon(DiscoverCircleIcon)
export const Copy = icon(Copy01Icon)
export const Download = icon(Download04Icon)
export const ExternalLink = icon(LinkSquare02Icon)
export const Eye = icon(ViewIcon)
export const EyeOff = icon(ViewOffSlashIcon)
export const FolderPlus = icon(FolderAddIcon)
export const History = icon(Clock01Icon)
export const Home = icon(Home01Icon)
export const ImageOff = icon(ImageNotFound01Icon)
export const Info = icon(InformationCircleIcon)
export const LoaderCircle = icon(Loading03Icon)
export const Mail = icon(Mail01Icon)
export const Minus = icon(MinusSignIcon)
export const Pause = icon(PauseIcon)
export const Pencil = icon(Edit02Icon)
export const Play = icon(PlayIcon)
export const Plus = icon(Add01Icon)
export const Puzzle = icon(PuzzleIcon)
export const RefreshCw = icon(RefreshIcon)
export const Search = icon(Search01Icon)
export const Settings = icon(Settings01Icon)
export const SlidersHorizontal = icon(SlidersHorizontalIcon)
export const Sparkles = icon(SparklesIcon)
export const Square = icon(Square01Icon)
export const Trash2 = icon(Delete02Icon)
export const Upload = icon(Upload04Icon)
export const UserRound = icon(UserIcon)
export const WifiOff = icon(WifiDisconnected01Icon)
export const X = icon(Cancel01Icon)

export const Heart = icon(FavouriteIcon)
export const Star = icon(StarIcon)
export const ThumbsDown = icon(ThumbsDownIcon)
export const Shuffle = icon(ShuffleIcon)
export const Mic = icon(Mic02Icon)
