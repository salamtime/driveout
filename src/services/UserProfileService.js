import { supabase } from '../lib/supabase';
import { TABLE_NAMES } from '../config/tableNames';
import FuelTransactionService from './FuelTransactionService';
import { adminApiRequest } from './adminApi';
import { buildTenantScopedStoragePath } from '../utils/storageUpload';
import { getCurrentOrganizationId } from './OrganizationService';

class UserProfileService {
  withTimeout(promise, timeoutMs = 5000, label = 'operation') {
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn(`⚠️ ${label} timed out; continuing without blocking the UI.`);
        resolve({ data: null, error: new Error(`${label} timed out`) });
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  isAbortLikeError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    const name = String(error?.name || '').toLowerCase();

    return (
      name === 'aborterror' ||
      message.includes('aborterror') ||
      message.includes('signal is aborted') ||
      message.includes('signal has been aborted') ||
      message.includes('the operation was aborted') ||
      message.includes('body stream already read')
    );
  }

  isActivityLogAccessError(error) {
    const message = String(error?.message || error?.details || '').toLowerCase();
    return (
      message.includes('permission denied') ||
      message.includes('forbidden') ||
      message.includes('403') ||
      message.includes('saharax_0u4w4d_activity_log') ||
      message.includes(TABLE_NAMES.ACTIVITY_LOG)
    );
  }

  buildContainsFilter(value = '') {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return `*${normalized.replaceAll(',', ' ').replaceAll('.', ' ')}*`;
  }

  getUsersTable() {
    return TABLE_NAMES.USERS || 'app_b30c02e74da644baad4668e3587d86b1_users';
  }

  splitFullName(fullName = '') {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return { first_name: '', last_name: '' };
    }

    if (parts.length === 1) {
      return { first_name: parts[0], last_name: '' };
    }

    return {
      first_name: parts.slice(0, -1).join(' '),
      last_name: parts.slice(-1).join(' '),
    };
  }

  normalizeUserRow(row, fallbackEmail = '') {
    if (!row) return null;

    const fullName = String(row.full_name || row.name || fallbackEmail || '').trim();
    const { first_name, last_name } = this.splitFullName(fullName);

    return {
      ...row,
      username: row.username || null,
      full_name: fullName,
      first_name: row.first_name || first_name,
      last_name: row.last_name || last_name,
      profile_picture_url: row.profile_picture_url || row.avatar_url || null,
      phone: row.phone || row.phone_number || null,
      address: row.address || null,
      date_of_birth: row.date_of_birth || null,
      emergency_contact: row.emergency_contact || null,
      emergency_phone: row.emergency_phone || null,
      staff_id_documents: Array.isArray(row.staff_id_documents) ? row.staff_id_documents : undefined,
    };
  }

  normalizeActivityQuery(limitOrOptions = 50, userName = '', userEmail = '') {
    if (typeof limitOrOptions === 'object' && limitOrOptions !== null) {
      return {
        limit: Math.max(1, Number(limitOrOptions.limit || 50)),
        offset: Math.max(0, Number(limitOrOptions.offset || 0)),
        userName: String(limitOrOptions.userName || '').trim(),
        userEmail: String(limitOrOptions.userEmail || '').trim(),
      };
    }

    return {
      limit: Math.max(1, Number(limitOrOptions || 50)),
      offset: 0,
      userName: String(userName || '').trim(),
      userEmail: String(userEmail || '').trim(),
    };
  }

  // Get user profile with role information
  async getUserProfile(userId) {
    try {
      const response = await adminApiRequest('/api/me/profile');
      return { data: this.normalizeUserRow(response?.profile), error: null };
    } catch (error) {
      if (this.isAbortLikeError(error)) {
        return { data: null, error: null };
      }
      if (this.isUsersTableAccessError(error)) {
        return { data: null, error: null };
      }
      console.error('❌ Error fetching user profile:', error);
      return { data: null, error };
    }
  }

  // Update user profile information
  async updateUserProfile(userId, profileData) {
    try {
      const response = await adminApiRequest('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileData),
      });

      return { data: this.normalizeUserRow(response?.profile), error: null };
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
      return { data: null, error };
    }
  }

  // Update user's Supabase auth metadata
  async updateAuthMetadata(updates) {
    try {
      console.log('🔐 Updating auth metadata');
      
      const { data, error } = await supabase.auth.updateUser(updates);
      
      if (error) {
        throw error;
      }

      console.log('✅ Auth metadata updated successfully');
      return { data, error: null };
    } catch (error) {
      console.error('❌ Error updating auth metadata:', error);
      return { data: null, error };
    }
  }

  // Change user password
  async changePassword(newPassword) {
    try {
      console.log('🔒 Changing user password');
      
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw error;
      }

      // Keep the current session/auth state in sync after a successful password update.
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('⚠️ Password updated but session refresh failed:', refreshError);
      }

      console.log('✅ Password changed successfully');
      return { data, error: null };
    } catch (error) {
      console.error('❌ Error changing password:', error);
      return { data: null, error };
    }
  }

  // Upload profile picture
  async uploadProfilePicture(userId, file) {
    try {
      console.log('📸 Uploading profile picture for:', userId);
      const organizationId = await getCurrentOrganizationId();
      
      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}_${Date.now()}.${fileExt}`;
      const filePath = buildTenantScopedStoragePath({
        organizationId,
        pathPrefix: `users/${userId}`,
        fileName,
      });

      // Upload file to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(filePath);

      // Persist to auth metadata first because the users table may not have a
      // profile_picture_url column in older deployments.
      const { error: metadataError } = await this.withTimeout(
        supabase.auth.updateUser({
          data: {
            profile_picture_url: publicUrl,
            avatar_url: publicUrl,
          },
        }),
        4500,
        'Profile auth metadata update'
      );

      if (metadataError) {
        console.warn('⚠️ Profile picture uploaded but auth metadata update failed:', metadataError);
      }

      // Best effort: update the app users table only when that column exists.
      const { data: updateData, error: updateError } = await this.withTimeout(
        supabase
          .from(this.getUsersTable())
          .update({
            profile_picture_url: publicUrl,
            avatar_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select()
          .single(),
        3500,
        'Profile users table update'
      );

      if (updateError) {
        console.warn('⚠️ Users table profile picture update skipped; profile picture stored in auth metadata only.', updateError);
      }

      console.log('✅ Profile picture uploaded successfully');
      return { data: { url: publicUrl, user: this.normalizeUserRow(updateData) || { profile_picture_url: publicUrl } }, error: null };
    } catch (error) {
      console.error('❌ Error uploading profile picture:', error);
      return { data: null, error };
    }
  }

  // Delete profile picture
  async deleteProfilePicture(userId, pictureUrl) {
    try {
      console.log('🗑️ Deleting profile picture for:', userId);
      
      let filePath = '';

      try {
        const normalizedUrl = new URL(pictureUrl);
        const marker = '/storage/v1/object/public/profile-pictures/';
        const markerIndex = normalizedUrl.pathname.indexOf(marker);
        if (markerIndex >= 0) {
          filePath = decodeURIComponent(normalizedUrl.pathname.slice(markerIndex + marker.length));
        }
      } catch {
        filePath = '';
      }

      if (!filePath) {
        const urlParts = String(pictureUrl || '').split('/');
        const fileName = urlParts[urlParts.length - 1];
        filePath = `${userId}/${fileName}`;
      }

      // Delete from storage
      const { error: deleteError } = await this.withTimeout(
        supabase.storage
          .from('profile-pictures')
          .remove([filePath]),
        3500,
        'Profile picture storage delete'
      );

      if (deleteError) {
        console.warn('⚠️ Error deleting file from storage:', deleteError);
      }

      const { error: metadataError } = await this.withTimeout(
        supabase.auth.updateUser({
          data: {
            profile_picture_url: null,
            avatar_url: null,
          },
        }),
        4500,
        'Profile auth metadata delete'
      );

      if (metadataError) {
        console.warn('⚠️ Profile picture deleted but auth metadata update failed:', metadataError);
      }

      // Best effort: update the app users table only when that column exists.
      const { data, error } = await this.withTimeout(
        supabase
          .from(this.getUsersTable())
          .update({
            profile_picture_url: null,
            avatar_url: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select()
          .single(),
        3500,
        'Profile users table delete'
      );
      if (error) {
        console.warn('⚠️ Users table profile picture delete skipped; profile picture cleared from auth metadata only.', error);
      }

      console.log('✅ Profile picture deleted successfully');
      return { data: this.normalizeUserRow(data), error: null };
    } catch (error) {
      console.error('❌ Error deleting profile picture:', error);
      return { data: null, error };
    }
  }

  // Get user activity log (if exists)
  async getUserActivityLog(userId, limitOrOptions = 50, legacyUserName = '', legacyUserEmail = '') {
    try {
      const { limit, offset, userName, userEmail } = this.normalizeActivityQuery(limitOrOptions, legacyUserName, legacyUserEmail);
      const fetchSize = Math.max(limit + offset + 20, 80);
      const directLogs = [];
      const normalizedUserName = String(userName || '').trim();
      const normalizedUserEmail = String(userEmail || '').trim().toLowerCase();
      const normalizedUserNameLower = normalizedUserName.toLowerCase();
      const normalizedUserEmailLower = normalizedUserEmail.toLowerCase();
      const buildEvent = ({
        id,
        action,
        description,
        details,
        createdAt,
        source,
        userName: eventUserName,
        metadata = {},
      }) => ({
        id,
        user_id: userId,
        action,
        title: action,
        description,
        details,
        created_at: createdAt || new Date().toISOString(),
        source,
        user_name: eventUserName || null,
        metadata,
      });

      const userNameMatches = (...candidates) => {
        if (!normalizedUserNameLower) return false;
        return candidates.some((candidate) =>
          String(candidate || '').toLowerCase().includes(normalizedUserNameLower)
        );
      };

      const userEmailMatches = (...candidates) => {
        if (!normalizedUserEmailLower) return false;
        return candidates.some((candidate) =>
          String(candidate || '').toLowerCase() === normalizedUserEmailLower
        );
      };

      const normalizeDirectLog = (log) => {
        const actionValue = log.action || log.event_name || log.title || 'Activity';
        const metadata = log.metadata || {};
        const isRentalContractPriceEdit = String(actionValue).toLowerCase() === 'rental_contract_price_edited';
        const isRentalAmountDueEdit = String(actionValue).toLowerCase() === 'rental_amount_due_edited';

        return buildEvent({
          id: `direct-${log.id || `${log.user_id}-${log.created_at || Date.now()}`}`,
          action: isRentalContractPriceEdit
            ? 'Edited rental contract price'
            : isRentalAmountDueEdit
              ? 'Edited amount due'
              : actionValue,
          description: isRentalContractPriceEdit
            ? `Edited rental contract price for ${metadata.rental_reference || metadata.rental_id || 'a rental'}`
            : isRentalAmountDueEdit
              ? `Edited amount due for ${metadata.rental_reference || metadata.rental_id || 'a rental'}`
            : (log.description || log.details || log.message || 'Platform activity recorded'),
          details: isRentalContractPriceEdit
            ? `${metadata.edited_by_name || log.user_name || 'Staff'} • ${Number(metadata.previous_price || 0)} MAD → ${Number(metadata.new_price || 0)} MAD${metadata.override_note ? ` • ${metadata.override_note}` : ''}`
            : isRentalAmountDueEdit
              ? `${metadata.edited_by_name || log.user_name || 'Staff'} • ${Number(metadata.previous_amount_due || 0)} MAD → ${Number(metadata.new_amount_due || 0)} MAD${metadata.override_note ? ` • ${metadata.override_note}` : ''}`
            : (log.details || log.message || log.event_name || log.description || 'No details'),
          createdAt: log.created_at || log.performed_at || log.updated_at,
          source: log.source || log.module || 'system',
          userName: log.user_name || log.actor_name || null,
          metadata,
        });
      };

      const buildRentalEvent = (rental, action, actorName, createdAt, metadata = {}) => buildEvent({
        id: `${rental.id}-${action}-${createdAt || rental.created_at || ''}`,
        action,
        description: `${action} rental ${rental.rental_id || rental.id}${rental.customer_name ? ` for ${rental.customer_name}` : ''}`,
        details: `${actorName || 'Staff'} • ${rental.vehicle_id ? `Vehicle ${rental.vehicle_id}` : 'Rental activity'}`,
        createdAt: createdAt || rental.created_at || rental.updated_at || new Date().toISOString(),
        source: 'rental',
        userName: actorName || null,
        metadata: {
          rental_id: rental.id,
          rental_reference: rental.rental_id || null,
          ...metadata,
        },
      });

      const selectColumns = 'id,rental_id,customer_name,vehicle_id,created_at,updated_at,created_by,created_by_name';

      const [createdResult, signedResult, startedResult, completedResult, extensionsResult, customersResult, tourActivityResult, fuelTransactionsResult] = await Promise.all([
        supabase
          .from(TABLE_NAMES.RENTALS)
          .select(selectColumns)
          .eq('created_by', userId)
          .order('created_at', { ascending: false })
          .limit(fetchSize),
        Promise.resolve({ data: [], error: null }),
        Promise.resolve({ data: [], error: null }),
        Promise.resolve({ data: [], error: null }),
        supabase
          .from('rental_extensions')
          .select('id,rental_id,requested_at,approved_at,requested_by,approved_by,extension_hours,extension_type,extension_value,extension_price,status')
          .order('requested_at', { ascending: false })
          .limit(fetchSize),
        supabase
          .from('app_4c3a7a6153_customers')
          .select('id,full_name,updated_at,scan_metadata')
          .order('updated_at', { ascending: false })
          .limit(fetchSize),
        normalizedUserEmail
          ? supabase
              .from(TABLE_NAMES.ACTIVITY_LOG)
              .select('id,action,user_email,details,created_at')
              .ilike('user_email', normalizedUserEmail)
              .order('created_at', { ascending: false })
              .limit(fetchSize)
          : Promise.resolve({ data: [], error: null }),
        FuelTransactionService.getAllTransactions({ limit: fetchSize }),
      ]);

      const normalizedDirectLogs = directLogs.map(normalizeDirectLog);
      const rentalFallbackLogs = [];

      if (!createdResult.error) {
        (createdResult.data || []).forEach((rental) => {
          rentalFallbackLogs.push(
            buildRentalEvent(rental, 'Created rental', rental.created_by_name, rental.created_at)
          );
        });
      }

      if (!signedResult.error) {
        (signedResult.data || []).forEach((rental) => {
          if (rental.contract_signed_by_name || rental.contract_signed_by) {
            rentalFallbackLogs.push(
              buildRentalEvent(rental, 'Signed contract', rental.contract_signed_by_name, rental.updated_at)
            );
          }
        });
      }

      if (!startedResult.error) {
        (startedResult.data || []).forEach((rental) => {
          if (rental.started_by_name || rental.started_by) {
            rentalFallbackLogs.push(
              buildRentalEvent(rental, 'Started rental', rental.started_by_name, rental.started_at)
            );
          }
        });
      }

      if (!completedResult.error) {
        (completedResult.data || []).forEach((rental) => {
          if (rental.completed_by_name || rental.completed_by) {
            rentalFallbackLogs.push(
              buildRentalEvent(rental, 'Completed rental', rental.completed_by_name, rental.completed_at)
            );
          }
        });
      }

      const extensionLogs = [];
      if (!extensionsResult.error) {
        (extensionsResult.data || []).forEach((extension) => {
          const requestedByMatches =
            String(extension?.requested_by || '') === String(userId) ||
            false;
          if (!requestedByMatches) return;

          const requesterName = normalizedUserName || 'Staff';
          extensionLogs.push(buildEvent({
            id: `extension-request-${extension.id}`,
            action: 'Requested extension',
            description: `Requested ${extension.extension_value || extension.extension_hours} ${extension.extension_type || 'hours'} extension for rental ${extension.rental_id}`,
            details: `${requesterName} • ${Number(extension.extension_price || 0)} MAD • ${extension.status || 'pending'}`,
            createdAt: extension.requested_at || extension.created_at,
            source: 'extension',
            userName: requesterName,
            metadata: {
              rental_id: extension.rental_id,
              extension_id: extension.id,
            },
          }));
        });
        (extensionsResult.data || []).forEach((extension) => {
          const approvedByMatches =
            String(extension?.approved_by || '') === String(userId) ||
            false;
          if (!approvedByMatches) return;

          const approverName = normalizedUserName || 'Staff';
          extensionLogs.push(buildEvent({
            id: `extension-approval-${extension.id}`,
            action: 'Approved extension',
            description: `Approved extension for rental ${extension.rental_id}`,
            details: `${approverName} • ${Number(extension.extension_price || 0)} MAD`,
            createdAt: extension.approved_at || extension.updated_at,
            source: 'extension',
            userName: approverName,
            metadata: {
              rental_id: extension.rental_id,
              extension_id: extension.id,
            },
          }));
        });
      }

      const fuelLogs = [];
      const buildFuelActorMatch = (row) => {
        const performedByUserId = row?.performed_by_user_id || row?.created_by;
        const candidateNames = [
          row?.performed_by_name,
          row?.filled_by,
          row?.refilled_by,
        ].filter(Boolean);

        if (performedByUserId && String(performedByUserId) === String(userId)) return true;
        if (!normalizedUserName) return false;
        return candidateNames.some((name) => String(name).toLowerCase().includes(normalizedUserName.toLowerCase()));
      };

      if (fuelTransactionsResult?.success) {
        (fuelTransactionsResult.transactions || []).filter(buildFuelActorMatch).forEach((row) => {
          const actorName = row.performed_by_name || row.refilled_by || row.filled_by || row.created_by || 'Staff';
          const isWithdrawal = String(row.transaction_type || '').toLowerCase().includes('withdrawal');
          fuelLogs.push(buildEvent({
            id: `fuel-${row.id}`,
            action: isWithdrawal ? 'Recorded fuel withdrawal' : 'Recorded fuel refill',
            description: `${isWithdrawal ? 'Recorded fuel withdrawal' : 'Recorded fuel refill'} for vehicle ${row.vehicle_id || 'N/A'}`,
            details: `${actorName} • ${Number(row.liters_withdrawn || row.liters_taken || row.liters_added || row.liters || row.amount || 0)}L${Number(row.total_cost || 0) > 0 ? ` • ${Number(row.total_cost || 0)} MAD` : ''}`,
            createdAt: row.created_at,
            source: 'fuel',
            userName: actorName,
            metadata: { fuel_transaction_id: row.id, vehicle_id: row.vehicle_id || null },
          }));
        });
      }

      const customerLogs = [];
      if (!customersResult.error) {
        (customersResult.data || []).forEach((customer) => {
          const noteHistory = Array.isArray(customer?.scan_metadata?.staff_notes_history)
            ? customer.scan_metadata.staff_notes_history
            : [];

          noteHistory.forEach((note) => {
            const matchesUser =
              (note?.created_by && String(note.created_by) === String(userId)) ||
              (normalizedUserName && String(note?.created_by_name || '').toLowerCase().includes(normalizedUserName.toLowerCase()));

            if (!matchesUser) return;

            customerLogs.push(buildEvent({
              id: `customer-note-${customer.id}-${note.id || note.created_at || ''}`,
              action: note?.is_alert ? 'Saved customer alert note' : 'Saved customer note',
              description: `Added note for customer ${customer.full_name || customer.id}`,
              details: note?.note_text || 'Customer note saved',
              createdAt: note?.created_at || customer.updated_at,
              source: 'customer',
              userName: note?.created_by_name || 'Staff',
              metadata: { customer_id: customer.id },
            }));
          });
        });
      }

      const tourLogs = [];
      if (!tourActivityResult.error) {
        const tourPingWindowMs = 2 * 60 * 60 * 1000;
        const compressedTourPings = new Map();

        (tourActivityResult.data || []).forEach((log) => {
          const action = String(log.action || 'Tour activity');
          const normalizedAction = action.toLowerCase();
          const metadata = log.details || {};
          const description = log?.details?.description || 'Tour activity recorded';
          const createdTime = new Date(log.created_at || Date.now()).getTime();
          const groupId = String(metadata.group_id || metadata.groupId || 'tour');

          if (normalizedAction === 'tour_location_ping') {
            const windowKey = Number.isFinite(createdTime)
              ? Math.floor(createdTime / tourPingWindowMs)
              : 'recent';
            const key = `${groupId}:${windowKey}`;
            const existing = compressedTourPings.get(key);
            const latestTime = existing ? new Date(existing.createdAt || 0).getTime() : 0;

            compressedTourPings.set(key, {
              id: `tour-location-ping-${key}`,
              action: 'Tour location updates',
              description: `${existing ? existing.count + 1 : 1} guide location ${existing ? 'updates' : 'update'} for ${metadata.package_name || metadata.packageName || 'tour tracking'}`,
              details: `${log.user_email || 'Staff'} • ${metadata.package_name || metadata.packageName || 'Live tour'}${groupId !== 'tour' ? ` • ${groupId}` : ''}`,
              createdAt: createdTime >= latestTime ? log.created_at : existing?.createdAt,
              source: 'tour',
              userName: log.user_email || null,
              metadata: {
                ...metadata,
                compressed_activity: true,
                compressed_action: 'tour_location_ping',
                count: existing ? existing.count + 1 : 1,
                first_seen_at: existing?.metadata?.first_seen_at || log.created_at,
                latest_seen_at: createdTime >= latestTime ? log.created_at : existing?.metadata?.latest_seen_at,
              },
              count: existing ? existing.count + 1 : 1,
            });
            return;
          }

          tourLogs.push(buildEvent({
            id: `tour-${log.id}`,
            action: action.replaceAll('_', ' '),
            description,
            details: `${log.user_email || 'Staff'}${metadata.package_name ? ` • ${metadata.package_name}` : ''}`,
            createdAt: log.created_at,
            source: 'tour',
            userName: log.user_email || null,
            metadata,
          }));
        });

        compressedTourPings.forEach((entry) => {
          tourLogs.push(buildEvent(entry));
        });
      }

      const mergedLogs = [...normalizedDirectLogs, ...rentalFallbackLogs, ...extensionLogs, ...fuelLogs, ...customerLogs, ...tourLogs]
        .filter(Boolean)
        .filter((log, index, logs) => logs.findIndex((candidate) => candidate.id === log.id) === index)
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      ;
      const pageLogs = mergedLogs.slice(offset, offset + limit);
      const hasMore = mergedLogs.length > offset + limit;

      return { data: pageLogs, hasMore, total: mergedLogs.length, error: null };
    } catch (error) {
      if (this.isAbortLikeError(error)) {
        console.warn('⚠️ User activity log request was aborted during rerender/navigation.');
        return { data: [], hasMore: false, total: 0, error: null };
      }
      if (this.isActivityLogAccessError(error)) {
        console.warn('⚠️ Activity log access unavailable; returning empty activity list.');
        return { data: [], hasMore: false, total: 0, error: null };
      }
      console.error('❌ Error fetching user activity log:', error);
      return { data: [], hasMore: false, total: 0, error };
    }
  }

  // Update user preferences
  async updateUserPreferences(userId, preferences) {
    try {
      console.log('⚙️ Updating user preferences for:', userId);
      
      const { data, error } = await supabase
        .from('users')
        .update({ 
          preferences: preferences,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ User preferences updated successfully');
      return { data, error: null };
    } catch (error) {
      console.error('❌ Error updating user preferences:', error);
      return { data: null, error };
    }
  }

  // Validate profile data
  validateProfileData(profileData) {
    const errors = {};

    if (profileData.first_name && profileData.first_name.trim().length < 2) {
      errors.first_name = 'First name must be at least 2 characters long';
    }

    if (profileData.last_name && profileData.last_name.trim().length < 2) {
      errors.last_name = 'Last name must be at least 2 characters long';
    }

    if (profileData.phone && !/^\+?[\d\s\-\(\)]+$/.test(profileData.phone)) {
      errors.phone = 'Please enter a valid phone number';
    }

    if (profileData.username && !/^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/.test(profileData.username)) {
      errors.username = 'Username must be 3-30 characters and use lowercase letters, numbers, dots, underscores, or hyphens';
    }

    if (profileData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (profileData.date_of_birth) {
      const birthDate = new Date(profileData.date_of_birth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      
      if (age < 16 || age > 120) {
        errors.date_of_birth = 'Please enter a valid date of birth';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  isMissingProfilePictureColumnError(error) {
    const message = String(error?.message || error?.details || '').toLowerCase();
    return (
      message.includes('profile_picture_url') &&
      (
        message.includes('does not exist') ||
        message.includes('schema cache') ||
        message.includes('could not find')
      )
    );
  }

  isUsersTableAccessError(error) {
    const message = String(error?.message || error?.details || '').toLowerCase();
    return (
      message.includes('infinite recursion detected in policy') ||
      message.includes('app_b30c02e74da644baad4668e3587d86b1_users') ||
      (message.includes('policy') && message.includes('users'))
    );
  }

  // Check if user can edit profile (role-based permissions)
  canEditProfile(userRole, targetUserId, currentUserId) {
    // Users can always edit their own profile
    if (targetUserId === currentUserId) {
      return true;
    }

    // Owners and admins can edit other profiles
    if (userRole === 'owner' || userRole === 'admin') {
      return true;
    }

    return false;
  }

  // Get allowed profile fields based on role
  getAllowedProfileFields(userRole) {
    const baseFields = [
      'first_name',
      'last_name',
      'username',
      'phone',
      'address',
      'date_of_birth',
      'profile_picture_url'
    ];

    const extendedFields = [
      ...baseFields,
      'emergency_contact',
      'emergency_phone',
      'preferences'
    ];

    const adminFields = [
      ...extendedFields,
      'role',
      'status',
      'notes'
    ];

    switch (userRole) {
      case 'owner':
        return adminFields;
      case 'admin':
        return adminFields;
      case 'employee':
      case 'guide':
        return extendedFields;
      case 'customer':
      default:
        return baseFields;
    }
  }
}

export default new UserProfileService();
