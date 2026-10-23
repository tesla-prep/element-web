/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The stroke icons of the owner-approved concept, drawn in currentColor.

import React, { type JSX } from "react";

interface IconProps extends React.SVGAttributes<SVGElement> {
    size?: number;
}

function Stroke({ size = 22, children }: IconProps & { children: React.ReactNode }): JSX.Element {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

export const ChatsIcon = (p: IconProps): JSX.Element => (
    <Stroke {...p}>
        <path d="M4 5h16v11H9l-5 4z" />
    </Stroke>
);

export const ChannelIcon = (p: IconProps): JSX.Element => (
    <Stroke {...p}>
        <path d="M4 10v4h3l7 4V6L7 10zM18 9a4 4 0 0 1 0 6" />
    </Stroke>
);

export const SettingsIcon = (p: IconProps): JSX.Element => (
    <Stroke {...p}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Stroke>
);

export const ChevronDownIcon = (p: IconProps): JSX.Element => (
    <Stroke size={16} {...p}>
        <path d="M6 9l6 6 6-6" />
    </Stroke>
);

export const ChevronUpIcon = (p: IconProps): JSX.Element => (
    <Stroke size={16} {...p}>
        <path d="M6 15l6-6 6 6" />
    </Stroke>
);

export const PencilIcon = (p: IconProps): JSX.Element => (
    <Stroke {...p}>
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Stroke>
);

export const KebabIcon = ({ size = 20 }: IconProps): JSX.Element => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="12" cy="19" r="1.8" />
    </svg>
);

export const SearchIcon = (p: IconProps): JSX.Element => (
    <Stroke size={18} {...p}>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
    </Stroke>
);

export const GroupIcon = (p: IconProps): JSX.Element => (
    <Stroke {...p}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </Stroke>
);

export const AddMemberIcon = (p: IconProps): JSX.Element => (
    <Stroke size={20} {...p}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" />
    </Stroke>
);

export const StarIcon = (p: IconProps): JSX.Element => (
    <Stroke size={20} {...p}>
        <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
    </Stroke>
);

export const BellOffIcon = (p: IconProps): JSX.Element => (
    <Stroke size={20} {...p}>
        <path d="M18 8a6 6 0 0 0-9.3-5M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M13.7 21a2 2 0 0 1-3.4 0M3 3l18 18" />
    </Stroke>
);

export const MediaIcon = (p: IconProps): JSX.Element => (
    <Stroke size={20} {...p}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
    </Stroke>
);

export const AllNumbersIcon = (p: IconProps): JSX.Element => (
    <Stroke {...p}>
        <path d="M4 6h16M4 12h16M4 18h16" />
    </Stroke>
);

export const TelegramIcon = (p: IconProps): JSX.Element => (
    <Stroke {...p}>
        <path d="M21 3L3 11l7 2 2 7z" />
    </Stroke>
);

export const CheckIcon = (p: IconProps): JSX.Element => (
    <Stroke size={18} {...p}>
        <path d="M5 12l5 5L20 7" />
    </Stroke>
);

export const BackIcon = (p: IconProps): JSX.Element => (
    <Stroke {...p}>
        <path d="M19 12H5M11 6l-6 6 6 6" />
    </Stroke>
);

export const CloseIcon = (p: IconProps): JSX.Element => (
    <Stroke size={20} {...p}>
        <path d="M6 6l12 12M18 6L6 18" />
    </Stroke>
);

export const LeaveIcon = (p: IconProps): JSX.Element => (
    <Stroke size={20} {...p}>
        <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
    </Stroke>
);

export const PlusIcon = (p: IconProps): JSX.Element => (
    <Stroke size={20} {...p}>
        <path d="M12 5v14M5 12h14" />
    </Stroke>
);
