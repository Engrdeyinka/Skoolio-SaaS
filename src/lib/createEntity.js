import { supabase } from '@/api/supabaseClient';

// Extract unknown column name from Supabase PGRST204 error messages like:
// "Could not find the 'event_time' column of 'events' in the schema cache"
function extractUnknownColumn(errorMessage) {
  const match = errorMessage?.match(/Could not find the '(\w+)' column/);
  return match ? match[1] : null;
}

// Retry an insert/update after stripping columns that don't exist in the schema yet.
// Handles PGRST204 errors caused by form fields that haven't been migrated yet.
async function withColumnStriping(fn, record) {
  let data = { ...record };
  const stripped = [];
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await fn(data);
    if (!result.error) return result;
    const col = extractUnknownColumn(result.error.message);
    if (col) {
      stripped.push(col);
      const next = { ...data };
      delete next[col];
      data = next;
    } else {
      return result; // non-schema error, let caller handle it
    }
  }
  return await fn(data);
}

export function createEntity(tableName) {
  return {
    list: async (orderBy, limit) => {
      let query = supabase.from(tableName).select('*');
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const col = desc ? orderBy.slice(1) : orderBy;
        query = query.order(col, { ascending: !desc });
      } else {
        query = query.order('created_date', { ascending: false });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    filter: async (conditions, orderBy) => {
      let query = supabase.from(tableName).select('*');
      for (const [key, value] of Object.entries(conditions)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const col = desc ? orderBy.slice(1) : orderBy;
        query = query.order(col, { ascending: !desc });
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    get: async (id) => {
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    create: async (record) => {
      const result = await withColumnStriping(
        (r) => supabase.from(tableName).insert(r).select().single(),
        record
      );
      if (result.error) throw result.error;
      return result.data;
    },

    update: async (id, updates) => {
      const result = await withColumnStriping(
        (r) => supabase.from(tableName).update(r).eq('id', id).select().single(),
        updates
      );
      if (result.error) throw result.error;
      return result.data;
    },

    delete: async (id) => {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
    },

    bulkCreate: async (records) => {
      // Apply column-stripping retry logic for arrays of records (same as create/update)
      let rows = records.map(r => ({ ...r }));
      for (let attempt = 0; attempt < 15; attempt++) {
        const { data, error } = await supabase.from(tableName).insert(rows).select();
        if (!error) return data || [];
        const col = extractUnknownColumn(error.message);
        if (col) {
          rows = rows.map(r => { const next = { ...r }; delete next[col]; return next; });
        } else {
          throw error;
        }
      }
      const { data, error } = await supabase.from(tableName).insert(rows).select();
      if (error) throw error;
      return data || [];
    },

    bulkDelete: async (ids) => {
      if (!ids || ids.length === 0) return;
      // Filter out any empty/null/undefined IDs to avoid "invalid uuid" errors
      const validIds = ids.filter(id => id && typeof id === 'string' && id.trim() !== '');
      if (validIds.length === 0) return;
      // Delete all matching IDs in a single query using .in()
      const CHUNK = 500;
      for (let i = 0; i < validIds.length; i += CHUNK) {
        const chunk = validIds.slice(i, i + CHUNK);
        const { error } = await supabase.from(tableName).delete().in('id', chunk);
        if (error) throw error;
      }
    },
  };
}
