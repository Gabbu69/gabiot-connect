import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/src/services/supabase';
import { SENSORS } from '@/src/components/DashboardComponents';

interface SensorReading {
  [key: string]: number;
}

interface SensorHistory {
  [key: string]: Array<{ t: number; v: number }>;
}

const generateReading = (base: number, range: number) => 
  +(base + (Math.random() - 0.5) * range).toFixed(2);

const initialHistory = (base: number, range: number) =>
  Array.from({ length: 20 }, (_, i) => ({
    t: i,
    v: generateReading(base, range),
  }));

export function useSensorData() {
  const [readings, setReadings] = useState<SensorReading>(() =>
    Object.fromEntries(SENSORS.map(s => [s.id, generateReading(s.base, s.range)]))
  );
  
  const [histories, setHistories] = useState<SensorHistory>(() =>
    Object.fromEntries(SENSORS.map(s => [s.id, initialHistory(s.base, s.range)]))
  );
  
  const [syncError, setSyncError] = useState(false);
  const logRef = useRef<any[]>([]);

  const syncToSupabase = useCallback(async (sensorId: string, value: number) => {
    try {
      const sensor = SENSORS.find(s => s.id === sensorId);
      if (!sensor) return;

      const { error } = await supabase
        .from('sensor_readings')
        .insert({
          sensor_id: sensorId,
          value: value,
        });

      if (error) {
        console.warn('Supabase sync failed:', error.message);
        setSyncError(true);
        return false;
      }
      
      setSyncError(false);
      return true;
    } catch (err) {
      console.warn('Sync error:', err);
      setSyncError(true);
      return false;
    }
  }, []);

  const updateSensorData = useCallback(async (user: string | null) => {
    if (!user) return;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    setReadings(prev => {
      const next: SensorReading = {};
      
      SENSORS.forEach(s => {
        const val = generateReading(s.base, s.range);
        next[s.id] = val;
        
        // Async sync to backend without blocking UI
        syncToSupabase(s.id, val).catch(console.warn);
      });

      return next;
    });

    setHistories(prev => {
      const next: SensorHistory = {};
      
      SENSORS.forEach(s => {
        const arr = [...prev[s.id], { t: prev[s.id].length, v: generateReading(s.base, s.range) }];
        next[s.id] = arr.slice(-30);
      });

      return next;
    });
  }, [syncToSupabase]);

  return {
    readings,
    histories,
    syncError,
    logRef,
    updateSensorData,
  };
}
