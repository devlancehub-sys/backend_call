import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { HostTier } from '../../common/utils/host-tier.util';

export class ChangeTierDto {
  @IsEnum(HostTier)
  @IsNotEmpty()
  tier: HostTier;
}

export class TierInfoDto {
  active_tier: HostTier;
  lifetime_talk_minutes: number;
  call_rate: number;
  day_host_share: number;
  day_platform_share: number;
  night_host_share: number;
  night_platform_share: number;
  is_content_creator: boolean;
  is_diamond_approved: boolean;
}

export class TierProgressDto {
  current_tier: HostTier;
  current_tier_label: string;
  lifetime_talk_minutes: number;
  next_tier: HostTier | null;
  next_tier_label: string | null;
  minutes_to_next_tier: number;
  unlocked_tiers: HostTier[];
  locked_tiers: HostTier[];
}
